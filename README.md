# AIO Fanout

AIO citation research desktop app — track AI Overview appearances across keywords, domains, and topics.

Source-available under the [Polyform Strict License 1.0.0](LICENSE).
You may view and use this software, but you may not modify or redistribute it without explicit permission from the licensor.

&copy; 2026 Jim Huang

---

## Requirements

- **Node.js** v18 or later
- **Python 3.9+**
- **API keys** — DataForSEO and (optionally) Google Gemini

---

## Setup

### 1. Install Node dependencies

```bash
npm install
npm run rebuild
```

`npm run rebuild` compiles `better-sqlite3` for your platform. Run it once after `npm install` and again any time you switch Node/Electron versions.

### 2. Install the Python sidecar

The crawler uses a Python sidecar for JS rendering and Cloudflare bypass:

```bash
pip install scrapling
scrapling install
```

`scrapling install` downloads the Playwright browser binaries (~150 MB, one-time).

### 3. Add your API keys

Launch the app and open the **Setup** tab to enter your credentials:

| Service | Where to get it |
|---|---|
| DataForSEO | [dataforseo.com](https://dataforseo.com) → Dashboard → API credentials (base64-encoded `email:password`) |
| Google Gemini *(optional)* | [aistudio.google.com](https://aistudio.google.com) → Get API key |

Gemini is used for semantic keyword clustering and content brief generation. If omitted, the app falls back to a local classifier.

---

## Running (development)

```bash
npm run dev
```

---

## Building a distributable

```bash
# macOS (produces dist/*.dmg for arm64 and x64)
npm run dist:mac

# Windows
npm run dist:win

# Linux
npm run dist:linux
```

Output is written to `dist/`. The macOS build is unsigned — on first launch, right-click the app and select **Open** to bypass Gatekeeper.
