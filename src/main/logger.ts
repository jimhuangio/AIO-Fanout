// Simple append-only file logger for diagnosing enrichment issues.
// Writes to ~/fanout-debug.log — readable by Claude during debugging.
import { appendFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const LOG_PATH = join(homedir(), 'fanout-debug.log')

export function log(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')}\n`
  try {
    appendFileSync(LOG_PATH, line, 'utf-8')
  } catch {
    // ignore write errors
  }
  console.log(...args)
}

export function logError(label: string, err: unknown): void {
  log(`ERROR ${label}:`, err instanceof Error ? err.stack ?? err.message : String(err))
}
