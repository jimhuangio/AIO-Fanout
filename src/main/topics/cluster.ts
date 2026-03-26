// Topic clustering — pure functions, no DB or network.
// Algorithm: keyword-text overlap (overlap coefficient) + shared AIO domain bonus.
// Uses connected components so transitive similarity creates clusters.

import { tokenize } from '../crawler/snippet-match'

export interface ClusterInput {
  id: number
  keyword: string
  domains: string[]        // AIO domain_root values for this keyword
  categoryId: number | null  // Google taxonomy category ID from DataForSEO
}

export interface Cluster {
  label: string                                    // top N-grams from member keywords
  keywords: string[]                               // member keyword text
  members: { id: number; similarity: number }[]   // members with similarity to centroid
}

const SIMILARITY_THRESHOLD = 0.28   // minimum combined score to link two keywords
const MAX_CLUSTER_SIZE     = 300    // cap runaway clusters

// Strip common plural/suffix forms so "cards" matches "card", "applying" matches "apply"
function normalize(token: string): string {
  if (token.length > 5 && token.endsWith('ing'))  return token.slice(0, -3)
  if (token.length > 6 && token.endsWith('tion'))  return token.slice(0, -4)
  if (token.length > 7 && token.endsWith('tions')) return token.slice(0, -5)
  if (token.length > 5 && token.endsWith('ies'))   return token.slice(0, -3) + 'y'
  if (token.length > 4 && token.endsWith('es'))    return token.slice(0, -2)
  if (token.length > 4 && token.endsWith('s'))     return token.slice(0, -1)
  return token
}

function normalizedTokenSet(text: string): Set<string> {
  return new Set(tokenize(text).map(normalize))
}

// Overlap coefficient: |A ∩ B| / min(|A|, |B|)
// Better than Jaccard for hierarchical SEO terms ("home loan" ⊂ "home loan requirements")
function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.min(a.size, b.size)
}

// Domain Jaccard: rewards keywords that cite the same domains in AIO
function domainJaccard(domsA: string[], domsB: string[]): number {
  if (domsA.length === 0 || domsB.length === 0) return 0
  const setA = new Set(domsA)
  const setB = new Set(domsB)
  let shared = 0
  for (const d of setA) if (setB.has(d)) shared++
  return shared / (setA.size + setB.size - shared)
}

// Combined score: text overlap (primary) + domain similarity (secondary)
function combinedScore(
  tokensA: Set<string>, domsA: string[],
  tokensB: Set<string>, domsB: string[]
): number {
  const textScore   = overlapCoefficient(tokensA, tokensB)
  const domainScore = domainJaccard(domsA, domsB)
  return textScore * 0.65 + domainScore * 0.35
}

export function clusterKeywords(inputs: ClusterInput[]): Cluster[] {
  if (inputs.length === 0) return []

  // If categories are available for at least some keywords, partition by category first.
  // This prevents keywords from different Google taxonomy categories from ever merging,
  // even when they share common tokens (e.g. "brain cancer" vs "lung cancer").
  const hasCategoryData = inputs.some(k => k.categoryId !== null)
  if (hasCategoryData) {
    const partitions = new Map<number | 'none', ClusterInput[]>()
    for (const kw of inputs) {
      const key = kw.categoryId ?? 'none'
      if (!partitions.has(key)) partitions.set(key, [])
      partitions.get(key)!.push(kw)
    }
    const all: Cluster[] = []
    for (const partition of partitions.values()) {
      all.push(...clusterPartition(partition))
    }
    return all.sort((a, b) => b.members.length - a.members.length)
  }

  return clusterPartition(inputs)
}

function clusterPartition(inputs: ClusterInput[]): Cluster[] {
  if (inputs.length === 0) return []

  // Pre-compute token sets
  const tokenSets = new Map<number, Set<string>>()
  for (const kw of inputs) {
    tokenSets.set(kw.id, normalizedTokenSet(kw.keyword))
  }

  // Build inverted index: token → keyword IDs (for efficient candidate pair generation)
  const tokenIndex = new Map<string, number[]>()
  for (const kw of inputs) {
    for (const token of tokenSets.get(kw.id)!) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, [])
      tokenIndex.get(token)!.push(kw.id)
    }
  }

  // Also index by domain for domain-only matches
  const domainIndex = new Map<string, number[]>()
  for (const kw of inputs) {
    for (const dom of kw.domains) {
      if (!domainIndex.has(dom)) domainIndex.set(dom, [])
      domainIndex.get(dom)!.push(kw.id)
    }
  }

  // Collect candidate pairs (share ≥1 token OR ≥1 domain)
  const seen = new Set<string>()
  const candidates: [number, number][] = []

  function addPair(a: number, b: number): void {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (!seen.has(key)) { seen.add(key); candidates.push([Math.min(a,b), Math.max(a,b)]) }
  }

  for (const ids of tokenIndex.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        addPair(ids[i], ids[j])
  }
  for (const ids of domainIndex.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        addPair(ids[i], ids[j])
  }

  // Build adjacency list from pairs that exceed threshold
  const inputMap = new Map(inputs.map(kw => [kw.id, kw]))
  const edges = new Map<number, Map<number, number>>()  // id → { neighborId → score }

  for (const [a, b] of candidates) {
    const kwA = inputMap.get(a)!
    const kwB = inputMap.get(b)!
    const score = combinedScore(tokenSets.get(a)!, kwA.domains, tokenSets.get(b)!, kwB.domains)
    if (score >= SIMILARITY_THRESHOLD) {
      if (!edges.has(a)) edges.set(a, new Map())
      if (!edges.has(b)) edges.set(b, new Map())
      edges.get(a)!.set(b, score)
      edges.get(b)!.set(a, score)
    }
  }

  // Connected components via BFS
  const visited = new Set<number>()
  const components: number[][] = []

  for (const kw of inputs) {
    if (visited.has(kw.id)) continue
    const component: number[] = []
    const queue = [kw.id]
    let head = 0
    visited.add(kw.id)
    while (head < queue.length) {
      const curr = queue[head++]
      component.push(curr)
      for (const neighbor of (edges.get(curr)?.keys() ?? [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(component)
  }

  // Convert components to clusters (cap large clusters; singletons get their own topic)
  const clusters: Cluster[] = []

  for (const component of components) {

    // If too large, keep the MAX_CLUSTER_SIZE members most connected to the rest
    const members = component.length > MAX_CLUSTER_SIZE
      ? component
          .map(id => ({ id, degree: edges.get(id)?.size ?? 0 }))
          .sort((a, b) => b.degree - a.degree)
          .slice(0, MAX_CLUSTER_SIZE)
          .map(x => x.id)
      : component

    // Compute similarity for each member: average of existing edge weights to cluster members.
    // Uses the pre-built edges map directly — O(degree) per node instead of O(n) scan.
    const memberSet = new Set(members)
    const membersWithSim = members.map(id => {
      const neighborMap = edges.get(id)
      let sum = 0
      let count = 0
      if (neighborMap) {
        for (const [other, score] of neighborMap) {
          if (memberSet.has(other)) { sum += score; count++ }
        }
      }
      return { id, similarity: Math.round((count > 0 ? sum / count : 0) * 100) / 100 }
    })

    // Label: top 3 most frequent normalized tokens across member keywords
    const freq = new Map<string, number>()
    for (const id of members) {
      for (const token of tokenSets.get(id)!) {
        freq.set(token, (freq.get(token) ?? 0) + 1)
      }
    }
    const topTokens = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t)
    const label = topTokens.join(' ')

    clusters.push({
      label,
      keywords: members.map(id => inputMap.get(id)!.keyword),
      members: membersWithSim
    })
  }

  // Sort by size descending
  return clusters.sort((a, b) => b.members.length - a.members.length)
}
