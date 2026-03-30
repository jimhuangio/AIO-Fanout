// Gemini API client — used for semantic keyword clustering and content brief generation.
// Uses gemini-2.5-pro with JSON response schema for reliable structured output.
import { fetch } from 'undici'
import type { Cluster } from '../topics/cluster'
import type { ContentBrief } from '../../types'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS  = 120_000

export async function testGeminiKey(apiKey: string): Promise<void> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the word OK.' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
      signal: AbortSignal.timeout(15_000)
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`)
  }
}

// Send up to 800 keywords per call — well within Gemini 2.0 Flash's context window.
// Larger sets are split into batches; each batch is clustered independently.
const BATCH_SIZE = 800

export async function clusterWithGemini(
  keywords: { id: number; keyword: string }[],
  apiKey: string
): Promise<Cluster[]> {
  if (keywords.length === 0) return []

  const allClusters: Cluster[] = []

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE)
    const clusters = await clusterBatch(batch, apiKey)
    allClusters.push(...clusters)
  }

  return allClusters.sort((a, b) => b.members.length - a.members.length)
}

async function clusterBatch(
  keywords: { id: number; keyword: string }[],
  apiKey: string
): Promise<Cluster[]> {
  const kwMap = new Map(keywords.map(k => [k.keyword.toLowerCase().trim(), k.id]))

  const prompt =
    `Group the following ${keywords.length} SEO keywords into semantic topic clusters.\n\n` +
    `Rules:\n` +
    `- Keywords about different specific subjects must be in different clusters (e.g. "brain cancer symptoms" and "lung cancer symptoms" are different clusters)\n` +
    `- Give each cluster a short, descriptive label (2-5 words)\n` +
    `- Every keyword must appear in exactly one cluster\n` +
    `- Singletons are fine\n\n` +
    `Keywords:\n` +
    keywords.map((k, i) => `${i + 1}. ${k.keyword}`).join('\n')

  const responseSchema = {
    type: 'object',
    properties: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label:    { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } }
          },
          required: ['label', 'keywords']
        }
      }
    },
    required: ['clusters']
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.1
        }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data    = await res.json() as any
  const text    = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')

  const parsed  = JSON.parse(text) as { clusters: { label: string; keywords: string[] }[] }

  return (parsed.clusters ?? []).map(c => {
    const members = c.keywords
      .map(kw => {
        const id = kwMap.get(kw.toLowerCase().trim())
        return id !== undefined ? { id, similarity: 1.0 } : null
      })
      .filter((m): m is { id: number; similarity: number } => m !== null)

    return { label: c.label, keywords: c.keywords, members }
  }).filter(c => c.members.length > 0)
}

// ─── Search Intent Classification ────────────────────────────────────────────

const INTENT_BATCH_SIZE = 200

export async function classifyIntentWithGemini(
  keywords: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (let i = 0; i < keywords.length; i += INTENT_BATCH_SIZE) {
    const batch = keywords.slice(i, i + INTENT_BATCH_SIZE)
    const batchResult = await classifyIntentBatch(batch, apiKey)
    Object.assign(result, batchResult)
  }
  return result
}

async function classifyIntentBatch(
  keywords: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const prompt =
    `Classify each keyword by search intent. Use only these labels: informational, navigational, commercial, transactional.\n\n` +
    `- informational: user wants to learn something\n` +
    `- navigational: user wants a specific website or brand\n` +
    `- commercial: user is researching before buying (best, reviews, compare)\n` +
    `- transactional: user wants to buy, download, or take action\n\n` +
    `Keywords:\n` +
    keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')

  const responseSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            intent:  { type: 'string', enum: ['informational', 'navigational', 'commercial', 'transactional'] }
          },
          required: ['keyword', 'intent']
        }
      }
    },
    required: ['results']
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0
        }
      }),
      signal: AbortSignal.timeout(60_000)
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini intent HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data   = await res.json() as any
  const text   = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini intent returned empty response')

  const parsed = JSON.parse(text) as { results: { keyword: string; intent: string }[] }
  const out: Record<string, string> = {}
  for (const item of parsed.results ?? []) {
    if (item.keyword && item.intent) out[item.keyword] = item.intent
  }
  return out
}

// ─── Content Brief Generation ─────────────────────────────────────────────────

export async function generateContentBrief(
  topicLabel: string,
  keywords: { keyword: string; searchVolume: number | null; searchIntent: string | null }[],
  snippets: string[],
  topDomain: string | null,
  apiKey: string
): Promise<ContentBrief> {
  const kwList = keywords
    .map(k => {
      const vol = k.searchVolume != null ? ` (${k.searchVolume.toLocaleString()}/mo)` : ''
      const intent = k.searchIntent ? ` [${k.searchIntent}]` : ''
      return `- ${k.keyword}${vol}${intent}`
    })
    .join('\n')

  const snippetList = snippets.slice(0, 10)
    .map((s, i) => `${i + 1}. "${s}"`)
    .join('\n')

  const prompt =
    `You are a senior SEO content strategist. Create a detailed content brief for the following topic cluster.\n\n` +
    `Topic: ${topicLabel}\n\n` +
    `Target keywords (with search volume and intent):\n${kwList}\n\n` +
    (snippetList ? `Top-ranking AIO content snippets for context:\n${snippetList}\n\n` : '') +
    (topDomain ? `Dominant AIO domain (main competitor to beat): ${topDomain}\n\n` : '') +
    `Generate a complete content brief.`

  const responseSchema = {
    type: 'object',
    properties: {
      h1:             { type: 'string' },
      targetAudience: { type: 'string' },
      contentType:    { type: 'string' },
      wordCount:      { type: 'string' },
      keyTopics:      { type: 'array', items: { type: 'string' } },
      outline: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading:   { type: 'string' },
            keyPoints: { type: 'array', items: { type: 'string' } }
          },
          required: ['heading', 'keyPoints']
        }
      }
    },
    required: ['h1', 'targetAudience', 'contentType', 'wordCount', 'keyTopics', 'outline']
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.4
        }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = await res.json() as any
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')

  return JSON.parse(text) as ContentBrief
}
