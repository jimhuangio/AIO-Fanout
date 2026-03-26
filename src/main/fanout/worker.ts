// Processes a single keyword: fetch SERP data → extract → store → schedule children
import { mcpClient } from '../mcp/client'
import type { ProjectMeta } from '../../types'

// Cached project meta — set once per run by the scheduler to avoid a DB read per keyword
let _runMeta: ProjectMeta | null = null
export function setRunMeta(meta: ProjectMeta): void { _runMeta = meta }
export function clearRunMeta(): void { _runMeta = null }

// Simple retry with exponential backoff (replaces p-retry ESM dep)
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  label = ''
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000)
        console.warn(`[worker] ${label} attempt ${attempt} failed, retrying in ${delay}ms:`, err)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}
import {
  getKeyword,
  markKeywordRunning,
  markKeywordDone,
  markKeywordError,
  insertSerpResult,
  insertAIOSources,
  insertPAAQuestions,
  insertChildKeywords,
  getProjectMeta,
  insertOrganicRankings
} from '../db'
import {
  extractAIOSources,
  extractPAAQuestions,
  extractSuggestedSearches,
  extractOrganicResults
} from './extract'

export interface WorkerCallbacks {
  onChildrenAdded: (childIds: number[]) => void
  onProgress: () => void
  onNewURLs?: (urls: string[]) => void
}

export async function processKeyword(
  keywordId: number,
  callbacks: WorkerCallbacks
): Promise<void> {
  const kw = getKeyword(keywordId)
  const meta = _runMeta ?? getProjectMeta()
  markKeywordRunning(keywordId)

  try {
    const payload = {
      keyword: kw.keyword,
      locationCode: meta.locationCode,
      languageCode: meta.languageCode,
      device: meta.device
    }

    // Fetch SERP (includes AIO as 'ai_overview' item type, and PAA)
    // Note: DataForSEO MCP has no AI Mode tool — AIO citations come from serp_organic_live_advanced
    const serpData = await withRetry(
      () => mcpClient.fetchSERP(payload),
      3,
      `SERP "${kw.keyword}"`
    )

    // Store raw JSON first (always — even if extraction fails later)
    insertSerpResult(keywordId, 'aio', JSON.stringify(serpData))

    // Extract and store AIO sources (pos 1-10)
    const aioSources = extractAIOSources(serpData)
    if (aioSources.length > 0) {
      insertAIOSources(keywordId, aioSources)
      callbacks.onNewURLs?.(aioSources.map(s => s.url))
    }

    // Extract and store organic rankings
    const organicResults = extractOrganicResults(serpData)
    if (organicResults.length > 0) {
      insertOrganicRankings(keywordId, organicResults)
    }

    const paaQuestions = extractPAAQuestions(serpData)
    if (paaQuestions.length > 0) {
      insertPAAQuestions(keywordId, kw.depth, paaQuestions)
    }

    // Fan-out: create children from PAA and/or suggested searches if below max depth
    if (kw.depth < meta.fanOutDepth) {
      const { childSource, fanOutCap } = meta
      const usePAA       = childSource !== 'instead_of_paa'
      const useSuggested = childSource === 'instead_of_paa' || childSource === 'with_paa'

      const candidates: { keyword: string; source: string }[] = []

      if (usePAA && paaQuestions.length > 0) {
        candidates.push(...paaQuestions.map((q) => ({ keyword: q.question, source: 'paa' })))
      }

      if (useSuggested) {
        const suggested = extractSuggestedSearches(serpData)
        candidates.push(...suggested.map((q) => ({ keyword: q, source: 'suggested' })))
      }

      // fanOutCap: 0 = no children, 1–98 = cap at N, 99 = unlimited
      if (fanOutCap === 0) return
      const capped = fanOutCap >= 99 ? candidates : candidates.slice(0, fanOutCap)

      if (capped.length > 0) {
        const newChildIds = insertChildKeywords(capped, keywordId, kw.depth, meta.exclusionKeywords)
        if (newChildIds.length > 0) {
          callbacks.onChildrenAdded(newChildIds)
        }
      }
    }

    markKeywordDone(keywordId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    markKeywordError(keywordId, msg)
    console.error(`[worker] fatal error for keyword ${keywordId} "${kw.keyword}":`, msg)
    // Don't rethrow — one failed keyword shouldn't crash the scheduler
  } finally {
    callbacks.onProgress()
  }
}
