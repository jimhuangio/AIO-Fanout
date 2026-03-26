#!/usr/bin/env python3
"""
Scrapling sidecar server for Fanout AIO Audit Tool.
Provides JS rendering + Cloudflare bypass via a persistent StealthySession.

Signals 'scrapling-ready:<port>' on stdout once the HTTP server is bound.
The browser session is created lazily on the first scrape request.

Usage:
    python3 scrapling-server.py [--port 11236]

Requirements:
    pip install scrapling
    scrapling install  # installs Playwright browsers
"""

import sys
import json
import re
import signal
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Lock

DEFAULT_PORT = 11236

# ── Session management ────────────────────────────────────────────────────────
# StealthySession keeps the browser open across requests — much faster than
# opening a new browser per fetch.

_session = None
_session_lock = Lock()


def get_session():
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                try:
                    from scrapling.fetchers import StealthySession
                    s = StealthySession(headless=True, solve_cloudflare=True)
                    s.__enter__()
                    _session = s
                except ImportError:
                    raise RuntimeError(
                        'Scrapling is not installed. '
                        'Run: pip install scrapling && scrapling install'
                    )
    return _session


def close_session():
    global _session
    if _session is not None:
        try:
            _session.__exit__(None, None, None)
        except Exception:
            pass
        _session = None


# ── Content extraction ────────────────────────────────────────────────────────
# Walks the DOM in document order via XPath and formats as markdown.
# The output is consumed by extractPageContentFromMarkdown() on the TS side.

_NOISE_TAGS = {
    'script', 'style', 'nav', 'footer', 'header', 'aside',
    'noscript', 'iframe', 'form', 'button', 'select', 'textarea',
}

_TAG_PREFIX = {
    'h1': '# ', 'h2': '## ', 'h3': '### ',
    'h4': '#### ', 'h5': '#### ', 'h6': '#### ',
    'li': '- ',
}

_CONTENT_XPATH = (
    '//*['
    'self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6 '
    'or self::p or self::li or self::blockquote'
    ']'
)


def _bare_tag(lxml_tag) -> str:
    """Strip XML namespace prefix from an lxml tag name."""
    return re.sub(r'\{[^}]+\}', '', str(lxml_tag)).lower()


def _in_noise_container(el) -> bool:
    """True if any ancestor element is a noise tag."""
    try:
        for ancestor in el.xpath('ancestor::*'):
            if _bare_tag(ancestor.root.tag) in _NOISE_TAGS:
                return True
    except Exception:
        pass
    return False


def extract_markdown(page) -> tuple:
    """Return (title, markdown_text) from a Scrapling page object."""
    title = ' '.join(page.css('title::text').getall()).strip()
    lines = []

    try:
        for el in page.xpath(_CONTENT_XPATH):
            tag = _bare_tag(el.root.tag) if hasattr(el, 'root') else ''
            if not tag or tag in _NOISE_TAGS:
                continue
            if _in_noise_container(el):
                continue

            text = re.sub(r'\s+', ' ', ' '.join(el.css('::text').getall())).strip()
            if len(text) < 20:
                continue

            prefix = _TAG_PREFIX.get(tag, '')
            lines.append(f'{prefix}{text}')

    except Exception as e:
        print(f'[scrapling] extract error: {e}', file=sys.stderr, flush=True)

    return title, '\n\n'.join(lines)


# ── HTTP handler ──────────────────────────────────────────────────────────────

class ScrapeHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default access log noise

    def do_GET(self):
        if self.path == '/health':
            self._json(200, {'ok': True})
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/scrape':
            self.send_error(404)
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            url = body.get('url', '').strip()

            if not url:
                self._json(400, {'error': 'url required'})
                return

            session = get_session()
            page = session.fetch(url, network_idle=True)
            title, markdown = extract_markdown(page)

            self._json(200, {
                'markdown': markdown,
                'title': title,
                'statusCode': 200,
            })

        except Exception as e:
            msg = str(e)
            print(f'[scrapling] error scraping: {msg}', file=sys.stderr, flush=True)
            self._json(500, {'error': msg})

    def _json(self, status: int, data: dict) -> None:
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Scrapling sidecar HTTP server')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    server = HTTPServer(('127.0.0.1', args.port), ScrapeHandler)

    def shutdown(*_):
        close_session()
        server.shutdown()

    signal.signal(signal.SIGTERM, shutdown)
    if hasattr(signal, 'SIGINT'):
        signal.signal(signal.SIGINT, shutdown)

    # Signal ready to the parent Node.js process
    print(f'scrapling-ready:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
