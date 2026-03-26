#!/bin/zsh
# Fanout SEO — double-click launcher
# Place this file anywhere (Desktop, Dock, etc.)
# First run: chmod +x Fanout.command

# ── Find the project directory ────────────────────────────────────────────────
SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="$SCRIPT_DIR"

# If the script was moved out of the project, update this path:
# PROJECT_DIR="/Users/jimhuang/Downloads/Github/Fanout"

cd "$PROJECT_DIR" || { echo "❌ Cannot find project at $PROJECT_DIR"; read; exit 1; }

# ── Check Node ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install via https://nodejs.org or nvm."
  read -r
  exit 1
fi

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" 2>&1)
if [[ $? -ne 0 ]]; then
  echo "⚠️  Node $(node -v) detected. Node 20+ recommended."
fi

# ── Check dependencies ────────────────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
  echo "📦 Installing dependencies (first run)..."
  npm install --ignore-scripts
  echo "🔨 Building native modules..."
  npm run rebuild
fi

# ── Check if better-sqlite3 is built for current Electron ────────────────────
SQLITE_NATIVE="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [[ ! -f "$SQLITE_NATIVE" ]]; then
  echo "🔨 Rebuilding better-sqlite3 for Electron..."
  npm run rebuild
fi

# ── Launch ────────────────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting Fanout SEO..."
echo "   Project: $PROJECT_DIR"
echo "   Node:    $(node -v)"
echo ""

npm run dev
