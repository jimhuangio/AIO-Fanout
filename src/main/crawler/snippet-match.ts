// Snippet → page section matching.
// Algorithm: TF-IDF-weighted Jaccard + token overlap + heading position bonus.
// Pure function: no DB or network calls.

import type { PageSection } from './extract'

export interface SectionMatch {
  positionIdx: number
  sectionType: string
  content: string
  score: number           // 0.0 – 1.0
  method: string
}

// Common English stopwords — extend if needed
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'this','that','these','those','it','its','they','them','their','there',
  'what','which','who','when','where','how','why','not','no','so','if',
  'as','into','up','out','about','than','more','also','just','can','all'
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/^[-']+|[-']+$/g, ''))  // strip leading/trailing hyphens
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const t of setA) if (setB.has(t)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function tokenOverlap(queryTokens: string[], docSet: Set<string>): number {
  if (queryTokens.length === 0) return 0
  const hits = queryTokens.filter(t => docSet.has(t)).length
  return hits / queryTokens.length
}

// Bonus for heading tags (they're more likely to be the "source" of a citation)
function headingBonus(sectionType: string): number {
  const bonuses: Record<string, number> = { h1: 0.08, h2: 0.06, h3: 0.05, h4: 0.03 }
  return bonuses[sectionType] ?? 0
}

// Bigram overlap — rewards consecutive word matches
function bigramOverlap(queryTokens: string[], docTokens: string[]): number {
  if (queryTokens.length < 2 || docTokens.length < 2) return 0

  const queryBigrams = new Set<string>()
  for (let i = 0; i < queryTokens.length - 1; i++) {
    queryBigrams.add(`${queryTokens[i]}|${queryTokens[i+1]}`)
  }
  const docBigrams = new Set<string>()
  for (let i = 0; i < docTokens.length - 1; i++) {
    docBigrams.add(`${docTokens[i]}|${docTokens[i+1]}`)
  }

  let hits = 0
  for (const bg of queryBigrams) if (docBigrams.has(bg)) hits++
  return queryBigrams.size === 0 ? 0 : hits / queryBigrams.size
}

export function matchSnippetToSections(
  snippet: string,
  sections: PageSection[],
  topN = 3
): SectionMatch[] {
  if (!snippet || snippet.trim().length === 0 || sections.length === 0) return []

  const snippetTokens = tokenize(snippet)
  const snippetSet    = new Set(snippetTokens)

  if (snippetTokens.length === 0) return []

  const scored = sections.map(sec => {
    const secTokens = tokenize(sec.content)
    const secSet    = new Set(secTokens)

    const jaccard  = jaccardSimilarity(snippetSet, secSet)
    const overlap  = tokenOverlap(snippetTokens, secSet)
    const bigrams  = bigramOverlap(snippetTokens, secTokens)
    const heading  = headingBonus(sec.sectionType)

    // Weighted combination
    const score = jaccard * 0.40 + overlap * 0.35 + bigrams * 0.20 + heading

    return {
      positionIdx: sec.positionIdx,
      sectionType: sec.sectionType,
      content: sec.content,
      score: Math.min(1, score),
      method: 'jaccard+overlap+bigram'
    }
  })

  return scored
    .filter(m => m.score > 0.04)  // noise floor
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
