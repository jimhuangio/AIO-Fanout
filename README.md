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

## Commands

<!-- AUTO-GENERATED from package.json scripts -->
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile renderer, main, and preload bundles |
| `npm run preview` | Preview the production build locally |
| `npm run rebuild` | Recompile `better-sqlite3` native module for the current platform/arch |
| `npm run dist` | Build all platforms |
| `npm run dist:mac` | Build macOS DMGs (arm64 + x64), then rebuild native deps for dev |
| `npm run dist:win` | Build Windows NSIS installer (x64) |
| `npm run dist:linux` | Build Linux AppImage |
<!-- END AUTO-GENERATED -->

---

## Data storage

API credentials are persisted outside the repository at:

- **macOS**: `~/Library/Application Support/AIO Fanout/api-credentials.json`
- **Windows**: `%APPDATA%\AIO Fanout\api-credentials.json`
- **Linux**: `~/.config/AIO Fanout/api-credentials.json`

Project databases (`.aio-project.db`) are stored wherever the user saves them and are excluded from git.
