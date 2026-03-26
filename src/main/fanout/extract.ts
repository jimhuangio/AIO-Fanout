// Pure parsing functions — no DB or network calls.
// Input: raw API response objects. Output: structured data.
// All functions use optional chaining so they degrade gracefully
// when the API shape differs from what we expect.

export interface ExtractedAIOSource {
  position: number
  url: string
  domainRoot: string
  domainFull: string
  aioSnippet: string | null
  resultType: 'aio'
}

export interface ExtractedPAAQuestion {
  question: string
  position: number
  aiAnswer: string | null
}

export interface ExtractedOrganicResult {
  domainRoot: string
  domainFull: string
  position: number
  url: string
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

export function parseDomainFull(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Known multi-part TLD suffixes (country + second-level)
const MULTI_TLDS = new Set([
  'com.au','net.au','org.au','edu.au','gov.au',
  'co.uk','org.uk','me.uk','net.uk','gov.uk','ac.uk',
  'co.nz','net.nz','org.nz',
  'co.za','org.za',
  'co.jp','or.jp','ne.jp',
  'com.br','net.br','org.br',
  'com.ar','com.mx','com.co','com.pe',
  'com.sg','com.hk','com.tw',
  'co.in','net.in','org.in',
])

export function parseDomainRoot(domainFull: string): string {
  // "support.google.com"    → "google.com"
  // "qsderm.com.au"         → "qsderm.com.au"
  // "support.google.co.uk"  → "google.co.uk"
  const parts = domainFull.split('.')
  if (parts.length <= 2) return domainFull
  // Check if last two parts form a known multi-part TLD
  const twoPartTLD = parts.slice(-2).join('.')
  if (MULTI_TLDS.has(twoPartTLD)) {
    return parts.length <= 3 ? domainFull : parts.slice(-3).join('.')
  }
  return twoPartTLD
}

// ─── AIO extraction from Google SERP Advanced response ───────────────────────

export function extractAIOSources(apiResponse: unknown): ExtractedAIOSource[] {
  const items = getItems(apiResponse)
  const aioItem = items.find((i: any) => i?.type === 'ai_overview')
  if (!aioItem) return []

  // DataForSEO puts the canonical cited sources in `references` at the top level.
  // Each reference's `position` field is a string ("left"/"right"), NOT a number,
  // so we ignore it and assign numeric positions by index instead.
  const references: any[] = aioItem.references ?? aioItem.items ?? []

  return references
    .filter((ref: any) => ref?.url)
    .map((ref: any, idx: number) => {
      const domainFull = parseDomainFull(ref.url)
      return {
        position: idx + 1,
        url: ref.url,
        domainRoot: parseDomainRoot(domainFull),
        domainFull,
        // DFS uses `text` for the per-source snippet; `snippet`/`description` don't exist
        aioSnippet: ref.text ?? ref.snippet ?? ref.description ?? null,
        resultType: 'aio' as const
      }
    })
}

// ─── PAA extraction ───────────────────────────────────────────────────────────

export function extractPAAQuestions(apiResponse: unknown): ExtractedPAAQuestion[] {
  const items = getItems(apiResponse)
  const paaItem = items.find((i: any) => i?.type === 'people_also_ask')
  if (!paaItem) return []

  const paaItems: any[] = paaItem.items ?? []
  return paaItems
    .filter((q: any) => q?.title || q?.question)
    .map((q: any, idx: number) => {
      const answer =
        q.expanded_element?.[0]?.description ??
        q.expanded_element?.[0]?.featured_title ??
        q.ai_snippet ??
        null

      return {
        question: q.title ?? q.question,
        position: q.position ?? idx + 1,
        aiAnswer: answer
      }
    })
}

// ─── Suggested / Related Searches extraction ─────────────────────────────────

export function extractSuggestedSearches(apiResponse: unknown): string[] {
  const items = getItems(apiResponse)
  const allTypes = items.map((i: any) => i?.type).filter(Boolean)
  console.log('[extract] SERP item types:', allTypes)
  const rsItem = items.find((i: any) =>
    i?.type === 'related_searches' ||
    i?.type === 'people_also_search' ||
    i?.type === 'suggested_searches'
  )
  if (!rsItem) return []
  console.log('[extract] suggested searches item type:', rsItem.type, 'items:', rsItem.items?.length)
  const rsItems: any[] = rsItem.items ?? []
  return rsItems
    .map((r: any) => r?.title ?? r?.query ?? r)
    .filter((q: any) => typeof q === 'string' && q.length > 0)
}

// ─── Organic results extraction ───────────────────────────────────────────────

export function extractOrganicResults(apiResponse: unknown): ExtractedOrganicResult[] {
  return getItems(apiResponse)
    .filter((i: any) => i?.type === 'organic' && i?.url)
    .map((i: any) => {
      const domainFull = parseDomainFull(i.url)
      return {
        domainFull,
        domainRoot: parseDomainRoot(domainFull),
        position: i.rank_absolute ?? i.position ?? 0,
        url: i.url
      }
    })
    .filter((r) => r.position > 0)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItems(apiResponse: unknown): any[] {
  if (!apiResponse || typeof apiResponse !== 'object') return []
  // Direct DataForSEO REST API response: { tasks: [{ result: [{ items: [...] }] }] }
  return (apiResponse as any)?.tasks?.[0]?.result?.[0]?.items ?? []
}
