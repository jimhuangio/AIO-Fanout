// Shared types used across main process and renderer (via IPC)
// Keep this file free of Node.js or browser-only imports.

export interface ProjectMeta {
  id: number
  name: string
  createdAt: number
  locationCode: number
  languageCode: string
  device: string
  fanOutDepth: number
  fanOutCap: number           // 0 = no children, 1–98 = cap at N, 99 = unlimited
  childSource: 'none' | 'instead_of_paa' | 'with_paa'  // whether to use suggested searches for fan-out
  exclusionKeywords: string[] // lowercase phrases; candidates matching any are skipped
  exportDir: string           // directory for HTML exports; empty = system temp
  dfsApiKey: string           // base64(login:password) — get from DataForSEO dashboard or btoa('email:pass')
  dfsLogin: string            // legacy; used to derive dfsApiKey if not set directly
  dfsPassword: string         // legacy
}

export interface JobCounts {
  pending: number
  queued: number
  running: number
  done: number
  error: number
}

// AIO Position 1-10 report (per position per domain)
export interface AIOPositionRow {
  position: number
  domain: string
  appearances: number
  uniqueKeywords: number
  sharePct: number
}

// AIO domain pivot: one row per domain, one column per position 1-10
export interface AIODomainPivotRow {
  domain: string
  pos1: number
  pos2: number
  pos3: number
  pos4: number
  pos5: number
  pos6: number
  pos7: number
  pos8: number
  pos9: number
  pos10: number
  totalAppearances: number
  visibilityScore: number // weighted: pos1=10pts, pos2=9pts, ...pos10=1pt
}

export interface KeywordRow {
  id: number
  keyword: string
  depth: number
  status: 'pending' | 'queued' | 'running' | 'done' | 'error'
  parentId: number | null
  doneAt: number | null
  errorMsg: string | null
  aioSourceCount: number
  searchVolume: number | null
  searchIntent: string | null
  domainPosition?: number  // set when queried via domain filter
}


export interface RunConfig {
  concurrency: number      // parallel API calls (default: 5)
  tasksPerMinute: number   // rate limit (default: 300)
}

export interface ProjectStats {
  totalKeywords: number
  keywordsWithAIO: number
  uniqueDomains: number
  pendingKeywords: number
  doneKeywords: number
  errorKeywords: number
}

// Raw AIO source before DB insert
export interface AIOSourceRaw {
  position: number
  url: string
  domainRoot: string
  domainFull: string
  aioSnippet: string | null
  resultType: 'aio'
}

export interface CrawlStats {
  total: number
  crawled: number
  errors: number
  pending: number
  matched: number  // pages with at least one snippet match
}

export interface CrawledPageRow {
  id: number
  url: string
  statusCode: number | null
  title: string | null
  crawledAt: number
  errorMsg: string | null
  sectionCount: number
  matchCount: number
  schemaTypes: string[]
}

export interface SnippetMatchRow {
  id: number
  aioSourceId: number
  keyword: string
  url: string
  sectionType: string
  content: string
  matchScore: number
  matchMethod: string
  position: number
}

// Content source breakdown: per domain, how many snippet matches came from each HTML element type
export interface ContentSourceRow {
  domain: string
  h1: number
  h2: number
  h3: number
  h4: number
  h5: number
  h6: number
  p: number
  li: number
  blockquote: number
  title: number
  metaDesc: number
  totalMatches: number
}

export interface TopicRow {
  id: number
  label: string
  memberCount: number
  avgSimilarity: number
  topKeywords: string | null       // top 5 keywords, pipe-separated
  topDomain: string | null         // domain with most AIO appearances across topic keywords
  topDomainCount: number | null    // how many times topDomain appeared
  bestDomain: string | null        // domain with the best (lowest) AIO position in topic
  bestDomainPosition: number | null
  totalSearchVolume: number | null // sum of search_volume for all keywords in topic
}

export interface ContentBrief {
  h1: string
  targetAudience: string
  contentType: string
  wordCount: string
  keyTopics: string[]
  outline: { heading: string; keyPoints: string[] }[]
}

export interface TopicKeywordRow {
  id: number
  keyword: string
  similarity: number
  depth: number
  aioSourceCount: number
  searchVolume: number | null
  searchIntent: string | null
}

// ─── Category hierarchy ───────────────────────────────────────────────────────

export interface SubCategoryRow {
  id: number
  mainCategoryId: number
  label: string
  position: number
  totalSearchVolume: number
  topDomain: string | null
  bestDomain: string | null
  bestDomainPosition: number | null
  topics: TopicRow[]
}

export interface MainCategoryRow {
  id: number
  label: string
  position: number
  totalSearchVolume: number
  subCategories: SubCategoryRow[]
}

export interface CategoryHierarchy {
  mainCategories: MainCategoryRow[]
  uncategorised: TopicRow[]
}
