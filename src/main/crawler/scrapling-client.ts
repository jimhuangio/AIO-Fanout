// Scrapling sidecar client — spawns a local Python HTTP server that provides
// JS rendering + Cloudflare bypass via Scrapling's StealthySession.
// Acts as Tier 2 in the crawler fallback chain (before the Firecrawl cloud API).
//
// Requirements (user machine):
//   pip install scrapling
//   scrapling install     ← installs Playwright browsers
//
// The server process is started lazily on first use and kept alive until stop().

import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { fetch } from 'undici'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

const PORT             = 11236
const BASE_URL         = `http://127.0.0.1:${PORT}`
const STARTUP_TIMEOUT  = 30_000   // ms — time allowed for Python process to bind
const REQUEST_TIMEOUT  = 60_000   // ms — includes browser launch + page load

export interface ScraplingResult {
  markdown:   string
  title:      string
  statusCode: number
}

export class ScraplingClient {
  private proc:         ChildProcess | null = null
  private ready                             = false
  private startPromise: Promise<void> | null = null

  /** Lazily start the Python sidecar. Safe to call multiple times. */
  async start(): Promise<void> {
    if (this.ready) return
    if (this.startPromise) return this.startPromise
    this.startPromise = this._spawn().catch(err => {
      this.startPromise = null
      throw err
    })
    return this.startPromise
  }

  get isReady(): boolean {
    return this.ready
  }

  /** Kill the sidecar process. */
  stop(): void {
    this.ready       = false
    this.startPromise = null
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
  }

  async scrape(url: string): Promise<ScraplingResult> {
    if (!this.ready) throw new Error('Scrapling sidecar is not running')

    const res = await fetch(`${BASE_URL}/scrape`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
      signal:  AbortSignal.timeout(REQUEST_TIMEOUT),
    })

    const body = await res.json() as Record<string, unknown>

    if (!res.ok || body['error']) {
      throw new Error(String(body['error'] ?? `Scrapling HTTP ${res.status}`))
    }

    return {
      markdown:   String(body['markdown']   ?? ''),
      title:      String(body['title']      ?? ''),
      statusCode: Number(body['statusCode'] ?? 200),
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private scriptPath(): string {
    // Dev: project root / resources / scrapling-server.py
    // Prod: process.resourcesPath / scrapling-server.py
    if (is.dev) {
      return join(app.getAppPath(), 'resources', 'scrapling-server.py')
    }
    return join(process.resourcesPath, 'scrapling-server.py')
  }

  private pythonCmd(): string {
    return process.platform === 'win32' ? 'python' : 'python3'
  }

  private async _spawn(): Promise<void> {
    const script = this.scriptPath()
    const python = this.pythonCmd()

    console.log(`[scrapling] starting sidecar: ${python} ${script}`)

    this.proc = spawn(python, [script, '--port', String(PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Scrapling sidecar startup timed out after ${STARTUP_TIMEOUT / 1000}s`))
      }, STARTUP_TIMEOUT)

      this.proc!.stdout!.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim()
        if (line.includes('scrapling-ready:')) {
          clearTimeout(timer)
          this.ready = true
          console.log('[scrapling] sidecar ready')
          resolve()
        }
      })

      this.proc!.stderr!.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim()
        if (line) console.warn('[scrapling]', line)
      })

      this.proc!.on('exit', (code) => {
        clearTimeout(timer)
        this.ready       = false
        this.startPromise = null
        this.proc        = null
        if (code !== 0 && code !== null) {
          reject(new Error(
            `Scrapling process exited with code ${code}. ` +
            `Ensure Scrapling is installed: pip install scrapling && scrapling install`
          ))
        }
      })

      this.proc!.on('error', (err) => {
        clearTimeout(timer)
        reject(new Error(
          `Failed to start Python: ${err.message}. ` +
          `Ensure Python 3 is installed and 'python3' is in your PATH.`
        ))
      })
    })
  }
}

export const scraplingClient = new ScraplingClient()
