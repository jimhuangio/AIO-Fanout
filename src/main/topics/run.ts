// Async clustering + categorisation entry point.
// 1. Clusters keywords into topics (Gemini or local fallback).
// 2. Writes topics to DB.
// 3. Calls Gemini to group topics into a 2-level category hierarchy.
// 4. Writes the hierarchy to DB (or leaves topics uncategorised on fallback).
import { clusterKeywords } from './cluster'
import { clusterWithGemini } from '../gemini/client'
import { categorizeTopics } from './categorize'
import { readAllCredentials } from '../credentials'
import { log, logError } from '../logger'
import { getTopics, clearAndInsertCategories } from '../db'
import type { ClusterInput, Cluster } from './cluster'

export async function runClustering(inputs: ClusterInput[]): Promise<Cluster[]> {
  const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''

  if (geminiKey) {
    log(`[topics] clustering ${inputs.length} keywords with Gemini`)
    try {
      const clusters = await clusterWithGemini(
        inputs.map(k => ({ id: k.id, keyword: k.keyword })),
        geminiKey
      )
      log(`[topics] Gemini returned ${clusters.length} clusters`)
      return clusters
    } catch (err) {
      logError('[topics] Gemini clustering failed, falling back to local', err)
      const clusters = clusterKeywords(inputs)
      log(`[topics] local fallback returned ${clusters.length} clusters`)
      return clusters
    }
  }

  log(`[topics] clustering ${inputs.length} keywords with local algorithm`)
  const clusters = clusterKeywords(inputs)
  log(`[topics] local algorithm returned ${clusters.length} clusters`)
  return clusters
}

// Called after insertTopics() has written clusters to the DB.
// Reads back the written topics (to get their DB IDs + labels), then calls
// Gemini to produce a 2-level category hierarchy and writes it.
export async function runCategorisation(): Promise<void> {
  const geminiKey = readAllCredentials()['gemini']?.apiKey ?? ''
  if (!geminiKey) {
    log('[categories] no Gemini key — topics will be uncategorised')
    return
  }

  const topics = getTopics().map(t => ({ id: t.id, label: t.label }))
  if (topics.length === 0) return

  log(`[categories] categorising ${topics.length} topics with Gemini`)
  const hierarchy = await categorizeTopics(topics, geminiKey)
  if (!hierarchy) {
    log('[categories] categorisation returned null — topics remain uncategorised')
    return
  }

  clearAndInsertCategories(hierarchy)
  log('[categories] hierarchy written to DB')
}
