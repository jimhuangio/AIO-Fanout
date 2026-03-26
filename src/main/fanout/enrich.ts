// Batch-enrich all un-enriched done/error keywords with search volume + intent.
// Called automatically by the scheduler after the fanout queue drains.
import { mcpClient } from '../mcp/client'
import { classifyIntentWithGemini } from '../gemini/client'
import { readAllCredentials } from '../credentials'
import { getUnenrichedKeywords, upsertKeywordEnrichment, getProjectMeta } from '../db'
import { log, logError } from '../logger'

const BATCH_SIZE = 100

export async function runEnrichment(
  isCancelled: () => boolean,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const unenriched = getUnenrichedKeywords()
  log(`[enrich] starting — ${unenriched.length} keywords to enrich`)
  if (unenriched.length === 0) return

  const total = unenriched.length
  const meta = getProjectMeta()
  const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''
  log(`[enrich] project meta — locationCode:${meta.locationCode} languageCode:${meta.languageCode}`)
  log(`[enrich] intent source: ${geminiKey ? 'gemini' : 'local classifier'}`)

  // Classify intent for all keywords up front using Gemini (one call per 200 keywords)
  const allKeywords = unenriched.map(k => k.keyword)
  let intentMapFull: Record<string, string> = {}
  if (geminiKey) {
    try {
      intentMapFull = await classifyIntentWithGemini(allKeywords, geminiKey)
      log(`[enrich] Gemini intent classified ${Object.keys(intentMapFull).length} keywords`)
    } catch (err) {
      logError('[enrich] Gemini intent failed — using local classifier', err)
    }
  }

  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    if (isCancelled()) { log('[enrich] cancelled'); return }

    const batch = unenriched.slice(i, i + BATCH_SIZE)
    const keywords = batch.map((k) => k.keyword)
    log(`[enrich] batch ${Math.floor(i / BATCH_SIZE) + 1} — ${keywords.length} keywords:`, keywords.slice(0, 5))

    const empty = keywords.reduce((m, k) => { m[k] = null; return m }, {} as Record<string, null>)

    const [volumeResult, categoryResult] = await Promise.allSettled([
      mcpClient.fetchSearchVolume(keywords, meta.locationCode, meta.languageCode),
      mcpClient.fetchCategories(keywords, meta.languageCode)
    ])

    const volumeMap   = volumeResult.status   === 'fulfilled' ? volumeResult.value   : empty
    const categoryMap = categoryResult.status === 'fulfilled' ? categoryResult.value : empty

    // Build intent map for this batch: Gemini result → local fallback
    const intentMap: Record<string, string> = {}
    for (const kw of keywords) {
      intentMap[kw] = intentMapFull[kw] ?? mcpClient.classifyIntentPublic(kw)
    }

    if (volumeResult.status   === 'rejected') logError('[enrich] volume API failed',   volumeResult.reason)
    if (categoryResult.status === 'rejected') logError('[enrich] category API failed', categoryResult.reason)

    log('[enrich] volumeMap sample:', Object.entries(volumeMap).slice(0, 5))
    log('[enrich] intentMap sample:', Object.entries(intentMap).slice(0, 5))
    log('[enrich] categoryMap sample:', Object.entries(categoryMap).slice(0, 5))

    upsertKeywordEnrichment(
      batch.map((k) => ({
        id: k.id,
        searchVolume: (volumeMap as any)[k.keyword] ?? null,
        searchIntent: (intentMap as any)[k.keyword] ?? null,
        categoryId:   (categoryMap as any)[k.keyword]?.id ?? null,
        categoryName: (categoryMap as any)[k.keyword]?.name ?? null
      }))
    )

    const done = Math.min(i + batch.length, total)
    log(`[enrich] batch done — ${done}/${total}`)
    onProgress?.(done, total)
  }
  log('[enrich] complete')
}
