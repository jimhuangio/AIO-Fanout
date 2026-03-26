// Global API credentials store — app-level, not per-project.
// Persisted to: <userData>/api-credentials.json
// Format: { serviceName: { fieldName: value, ... }, ... }
//
// Services that have dedicated UIs: "dataforseo"
// All other services are stored as generic key-value entries.

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export type CredentialsStore = Record<string, Record<string, string>>

function credentialsPath(): string {
  return join(app.getPath('userData'), 'api-credentials.json')
}

export function readAllCredentials(): CredentialsStore {
  const path = credentialsPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as CredentialsStore
  } catch {
    return {}
  }
}

export function saveServiceCredentials(
  service: string,
  fields: Record<string, string>
): void {
  const store = readAllCredentials()
  store[service] = fields
  writeFileSync(credentialsPath(), JSON.stringify(store, null, 2), 'utf-8')
}

export function removeServiceCredentials(service: string): void {
  const store = readAllCredentials()
  delete store[service]
  writeFileSync(credentialsPath(), JSON.stringify(store, null, 2), 'utf-8')
}
