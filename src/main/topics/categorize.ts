// Gemini-powered two-level category hierarchy generator.
// Given an array of topic labels+IDs, asks gemini-2.5-pro to group them into
// mainCategory → subCategory → topics. Falls back silently (returns null) on
// any error so the caller can skip the DB write and leave topics uncategorised.

import { fetch } from 'undici'
import { log, logError } from '../logger'
import type { CategoryHierarchyInput } from '../db'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

interface GeminiCategory {
  label: string
  subCategories: {
    label: string
    topicLabels: string[]
  }[]
}

export async function categorizeTopics(
  topics: { id: number; label: string }[],
  apiKey: string
): Promise<CategoryHierarchyInput | null> {
  if (topics.length === 0) return null

  const labelList = topics.map((t, i) => `${i + 1}. ${t.label}`).join('\n')

  const prompt = `You are a semantic SEO categorisation assistant.

Group these ${topics.length} SEO topic labels into a two-level hierarchy.
Return ONLY a JSON object — no markdown, no explanation.
Every topic must appear in exactly one sub-category.
Aim for 3-8 main categories. Aim for 2-6 sub-categories per main category.

Topics:
${labelList}

Return format:
{
  "mainCategories": [
    {
      "label": "string",
      "subCategories": [
        {
          "label": "string",
          "topicLabels": ["exact topic label from the list"]
        }
      ]
    }
  ]
}`

  const schema = {
    type: 'object',
    properties: {
      mainCategories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            subCategories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  topicLabels: { type: 'array', items: { type: 'string' } }
                },
                required: ['label', 'topicLabels']
              }
            }
          },
          required: ['label', 'subCategories']
        }
      }
    },
    required: ['mainCategories']
  }

  try {
    const res = await fetch(
      `${GEMINI_BASE}/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0.1
          }
        }),
        signal: AbortSignal.timeout(60_000)
      }
    )

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`)

    const body = await res.json() as any
    const text: string = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const parsed = JSON.parse(text) as { mainCategories: GeminiCategory[] }

    // Build a case-insensitive lookup from label → topic id
    const labelToId = new Map(topics.map(t => [t.label.toLowerCase(), t.id]))

    const hierarchy: CategoryHierarchyInput = {
      mainCategories: parsed.mainCategories.map(mc => ({
        label: mc.label,
        subCategories: mc.subCategories.map(sc => ({
          label: sc.label,
          topicIds: sc.topicLabels
            .map(l => labelToId.get(l.toLowerCase()))
            .filter((id): id is number => id !== undefined)
        }))
      }))
    }

    const assignedCount = hierarchy.mainCategories
      .flatMap(mc => mc.subCategories)
      .reduce((sum, sc) => sum + sc.topicIds.length, 0)
    log(`[categories] Gemini assigned ${assignedCount}/${topics.length} topics to categories`)

    return hierarchy
  } catch (err) {
    logError('[categories] Gemini categorisation failed — topics will be uncategorised', err)
    return null
  }
}
