// Firecrawl REST API client — JS-rendered page scraping.
// POST /v1/scrape → returns markdown + metadata (title, description, statusCode).
// Used as a drop-in replacement for direct fetch when an API key is configured.
// Falls back gracefully: if Firecrawl fails, caller can retry with plain fetch.

import { fetch } from 'undici'

const FIRECRAWL_BASE = 'https://api.firecrawl.dev'
const TIMEOUT_MS = 30_000

export interface FirecrawlResult {
  markdown: string
  title: string
  metaDesc: string
  statusCode: number
}

export async function firecrawlTestKey(apiKey: string): Promise<void> {
  const res = await fetch(`${FIRECRAWL_BASE}/v0/keyAuth`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000)
  })
  if (res.status === 401 || res.status === 403) throw new Error('Invalid API key')
  if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`)
}

export async function firecrawlScrape(url: string, apiKey: string): Promise<FirecrawlResult> {
  const res = await fetch(`${FIRECRAWL_BASE}/v1/scrape`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true   // strips nav / footer / sidebar automatically
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })

  if (!res.ok) {
    throw new Error(`Firecrawl HTTP ${res.status}`)
  }

  const body = await res.json() as any
  if (!body?.success) {
    throw new Error(`Firecrawl error: ${body?.error ?? 'unknown'}`)
  }

  const data = body.data ?? {}
  return {
    markdown:   data.markdown  ?? '',
    title:      data.metadata?.title       ?? '',
    metaDesc:   data.metadata?.description ?? '',
    statusCode: data.metadata?.statusCode  ?? res.status
  }
}
