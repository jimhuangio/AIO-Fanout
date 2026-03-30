// DataForSEO REST API client — direct HTTP, no MCP server subprocess.
// Auth: Authorization: Basic <base64(login:password)>
// Get your key: btoa('your@email.com:yourpassword')  OR copy from the DataForSEO dashboard.

import { fetch } from 'undici'
import { log, logError } from '../logger'

const DFS_BASE = 'https://api.dataforseo.com'
const TIMEOUT_MS = 30_000

export interface SERPPayload {
  keyword: string
  locationCode: number
  languageCode: string
  device: string
}


export class DataForSEOClient {
  private apiKey: string | null = null

  // apiKey = base64-encoded "login:password"
  connect(apiKey: string): void {
    if (!apiKey.trim()) throw new Error('API key is empty')
    this.apiKey = apiKey.trim()
  }

  disconnect(): void {
    this.apiKey = null
  }

  isConnected(): boolean {
    return !!this.apiKey
  }

  // Validate the key with a cheap GET call (no SERP credit consumed)
  async testConnection(): Promise<{ ok: boolean }> {
    await this.get('/v3/appendix/user_data')
    return { ok: true }
  }

  async fetchSERP(payload: SERPPayload): Promise<unknown> {
    return this.post('/v3/serp/google/organic/live/advanced', [
      {
        keyword:                  payload.keyword,
        location_code:            payload.locationCode,
        language_code:            payload.languageCode,
        device:                   payload.device,
        depth:                    100,
        load_async_ai_overview:   true
      }
    ])
  }

  // Returns keyword → search volume (null if not found)
  async fetchSearchVolume(
    keywords: string[],
    locationCode: number,
    languageCode: string
  ): Promise<Record<string, number | null>> {
    // Google Ads rejects: special chars, and keywords with more than 10 words
    const sanitizeKw = (kw: string): string => kw.replace(/[?!+"%]/g, '').replace(/\s+/g, ' ').trim()
    const sanitizedToOriginal: Record<string, string> = {}
    const sanitized = keywords
      .map((kw) => {
        const s = sanitizeKw(kw)
        sanitizedToOriginal[s] = kw
        return s
      })
      .filter((s) => s.split(' ').length <= 10)  // Google Ads max 10 words

    const data = await this.post('/v3/keywords_data/google_ads/search_volume/live', [
      { keywords: sanitized, location_code: locationCode, language_code: languageCode }
    ]) as any

    const result: Record<string, number | null> = {}
    for (const kw of keywords) result[kw] = null
    const items: any[] = data?.tasks?.[0]?.result ?? []
    log('[volume] raw task status:', data?.tasks?.[0]?.status_code, data?.tasks?.[0]?.status_message)
    log('[volume] result item count:', items.length)
    if (items.length > 0) log('[volume] first item keys:', Object.keys(items[0]))
    for (const item of items) {
      if (!item.keyword) continue
      // Map sanitized keyword back to original
      const original = sanitizedToOriginal[item.keyword] ?? item.keyword
      result[original] = item.search_volume ?? null
    }
    return result
  }

  // Returns keyword → { id, name } for the primary Google taxonomy category (null if not found)
  async fetchCategories(
    keywords: string[],
    languageCode: string
  ): Promise<Record<string, { id: number; name: string } | null>> {
    const data = await this.post('/v3/dataforseo_labs/google/categories_for_keywords/live', [
      { keywords, language_code: languageCode }
    ]) as any
    const result: Record<string, { id: number; name: string } | null> = {}
    for (const kw of keywords) result[kw] = null
    log('[categories] raw task status:', data?.tasks?.[0]?.status_code, data?.tasks?.[0]?.status_message)
    log('[categories] result raw (first 300 chars):', JSON.stringify(data?.tasks?.[0]?.result).slice(0, 300))
    // categories_for_keywords nests results: tasks[0].result[0].items[]
    const items: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? data?.tasks?.[0]?.result ?? []
    log('[categories] items count:', items.length)
    if (items.length > 0) log('[categories] first item keys:', Object.keys(items[0]))
    for (const item of items) {
      if (!item.keyword || !item.categories?.length) continue
      result[item.keyword] = { id: item.categories[0], name: String(item.categories[0]) }
    }
    return result
  }

  // Local fallback intent classifier — used when the DataForSEO Labs endpoint is unavailable
  classifyIntentPublic(keyword: string): string { return this.classifyIntent(keyword) }
  private classifyIntent(keyword: string): string {
    const kw = keyword.toLowerCase()
    const transactional = /\b(buy|purchase|order|shop|deal|coupon|discount|cheap|price|cost|hire|download|get|sign up|subscribe|near me|delivery|shipping)\b/
    const commercial = /\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|recommend|rating|rated|worth|pros and cons)\b/
    const navigational = /\b(login|log in|sign in|website|official|homepage|account|portal|app)\b/
    if (transactional.test(kw)) return 'transactional'
    if (commercial.test(kw)) return 'commercial'
    if (navigational.test(kw)) return 'navigational'
    return 'informational'
  }

  // Returns keyword → main intent label (null if not found)
  async fetchSearchIntent(
    keywords: string[],
    languageCode: string
  ): Promise<Record<string, string | null>> {
    const sanitizeKw = (kw: string): string => kw.replace(/[?!+"%]/g, '').replace(/\s+/g, ' ').trim()
    const sanitizedToOriginal: Record<string, string> = {}
    const sanitized = keywords
      .map((kw) => {
        const s = sanitizeKw(kw)
        sanitizedToOriginal[s] = kw
        return s
      })
      .filter((s) => s.length > 0 && s.split(' ').length <= 10)

    const result: Record<string, string | null> = {}
    for (const kw of keywords) result[kw] = null
    if (sanitized.length === 0) return result

    log('[intent] sending sanitized keywords sample:', sanitized.slice(0, 5))
    const data = await this.post('/v3/dataforseo_labs/google/search_intent/live', [
      { keywords: sanitized, language_code: languageCode }
    ]) as any
    log('[intent] raw task status:', data?.tasks?.[0]?.status_code, data?.tasks?.[0]?.status_message)
    log('[intent] result raw (first 300 chars):', JSON.stringify(data?.tasks?.[0]?.result).slice(0, 300))
    // The search_intent endpoint nests results: tasks[0].result[0].items[]
    const items: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? data?.tasks?.[0]?.result ?? []
    // Check task-level status — top-level 20000 doesn't mean the task succeeded
    const taskStatus = data?.tasks?.[0]?.status_code
    if (taskStatus && taskStatus !== 20000) {
      logError?.('[intent] task-level error', `${taskStatus}: ${data?.tasks?.[0]?.status_message}`)
    }
    log('[intent] items count:', items.length)
    if (items.length > 0) log('[intent] first item keys:', Object.keys(items[0]))
    for (const item of items) {
      if (!item.keyword) continue
      // keyword_intent can be a plain string ("informational") or an object ({ label, probability })
      const ki = item.keyword_intent
      const intent = typeof ki === 'string' ? ki : (ki?.label ?? null)
      const original = sanitizedToOriginal[item.keyword] ?? item.keyword
      result[original] = intent
    }

    // Fall back to local classifier for any keyword the API didn't return
    for (const kw of keywords) {
      if (result[kw] === null) result[kw] = this.classifyIntent(kw)
    }
    return result
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${DFS_BASE}${path}`, {
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status} on GET ${path}`)
    const data = await res.json() as any
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`)
    }
    return data
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${DFS_BASE}${path}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) {
      const responseText = await res.text().catch(() => '')
      throw new Error(`DataForSEO HTTP ${res.status} on POST ${path}: ${responseText.slice(0, 500)}`)
    }
    const data = await res.json() as any
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO error ${data.status_code}: ${data.status_message}`)
    }
    return data
  }

  private authHeaders(): Record<string, string> {
    if (!this.apiKey) throw new Error('DataForSEO not connected — call connect(apiKey) first')
    return { Authorization: `Basic ${this.apiKey}` }
  }
}

export const mcpClient = new DataForSEOClient()
