// HTML → structured page sections.
// Pure function: in=HTML string, out=sections array. No DB or network.
import * as cheerio from 'cheerio'

export interface PageSection {
  sectionType: string   // 'title' | 'h1'–'h6' | 'p' | 'li' | 'blockquote'
  content: string
  positionIdx: number
}

export interface ExtractedPage {
  title: string
  metaDesc: string
  sections: PageSection[]
  schemaTypes: string[]   // unique @type values from JSON-LD blocks
  wordCount: number
  isLikelyEmpty: boolean  // true if JS-rendered SPA with no real content
}

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'nav', 'footer', 'header',
  'aside', '.sidebar', '.nav', '.menu', '.ads', '.advertisement',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '.cookie-banner', '.popup', '#cookie-notice', '.breadcrumb'
].join(', ')

const MIN_CONTENT_LENGTH = 20

export function extractPageContent(html: string): ExtractedPage {
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim()
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? ''

  // Extract structured data BEFORE removing noise (scripts are stripped by noise removal)
  const schemaTypes = extractStructuredData($)

  // Remove noise before extracting
  $(NOISE_SELECTORS).remove()

  const sections: PageSection[] = []
  let idx = 0

  // Extract in document order
  $('h1,h2,h3,h4,h5,h6,p,li,blockquote').each((_, el) => {
    const tag = el.tagName.toLowerCase()
    const text = $(el).text().trim().replace(/\s+/g, ' ')

    if (text.length < MIN_CONTENT_LENGTH) return
    // Skip nav-like li items (very short or just one word)
    if (tag === 'li' && text.split(' ').length < 3) return

    sections.push({ sectionType: tag, content: text, positionIdx: idx++ })
  })

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const wordCount = bodyText.split(' ').filter(Boolean).length

  // Heuristic: if fewer than 50 words of content, probably a JS SPA
  const isLikelyEmpty = wordCount < 50 && sections.length < 3

  return { title, metaDesc, sections, schemaTypes, wordCount, isLikelyEmpty }
}

// Extract all unique @type values from JSON-LD <script> blocks.
// Handles nested objects and @graph arrays.
function extractStructuredData($: ReturnType<typeof cheerio.load>): string[] {
  const types = new Set<string>()

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? ''
      const json = JSON.parse(raw)
      collectTypes(json, types)
    } catch { /* ignore malformed JSON-LD */ }
  })

  return [...types]
}

function collectTypes(obj: unknown, out: Set<string>): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    for (const item of obj) collectTypes(item, out)
    return
  }
  const record = obj as Record<string, unknown>
  const t = record['@type']
  if (Array.isArray(t)) {
    for (const s of t) if (typeof s === 'string') out.add(s)
  } else if (typeof t === 'string') {
    out.add(t)
  }
  // Recurse into values to catch @graph and nested entities
  for (const val of Object.values(record)) {
    if (val && typeof val === 'object') collectTypes(val, out)
  }
}

// ─── Markdown → sections (used when Firecrawl returns pre-rendered content) ──

export function extractPageContentFromMarkdown(
  markdown: string,
  title = '',
  metaDesc = ''
): ExtractedPage {
  const sections: PageSection[] = []
  let idx = 0

  // Accumulate consecutive non-heading lines into paragraph buffers
  let paraLines: string[] = []

  const flushPara = (): void => {
    const text = paraLines.join(' ').replace(/\s+/g, ' ').trim()
    paraLines = []
    if (text.length >= MIN_CONTENT_LENGTH) {
      sections.push({ sectionType: 'p', content: text, positionIdx: idx++ })
    }
  }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (!line) { flushPara(); continue }

    // Headings: # H1 / ## H2 / … / ###### H6
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      flushPara()
      const level = headingMatch[1].length
      const text = headingMatch[2].replace(/\*\*/g, '').trim()
      if (text.length >= MIN_CONTENT_LENGTH) {
        sections.push({ sectionType: `h${level}`, content: text, positionIdx: idx++ })
      }
      continue
    }

    // List items: - / * / 1.
    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.+)/)
    if (listMatch) {
      flushPara()
      const text = listMatch[1].replace(/\*\*/g, '').trim()
      if (text.length >= MIN_CONTENT_LENGTH && text.split(' ').length >= 3) {
        sections.push({ sectionType: 'li', content: text, positionIdx: idx++ })
      }
      continue
    }

    // Blockquote: > text
    const bqMatch = line.match(/^>\s+(.+)/)
    if (bqMatch) {
      flushPara()
      const text = bqMatch[1].trim()
      if (text.length >= MIN_CONTENT_LENGTH) {
        sections.push({ sectionType: 'blockquote', content: text, positionIdx: idx++ })
      }
      continue
    }

    // Skip image/link-only lines that carry no text
    if (/^!?\[.*\]\(.*\)$/.test(line)) continue

    // Strip inline markdown and accumulate as paragraph
    const clean = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')  // links/images → alt text
      .replace(/\*\*([^*]+)\*\*/g, '$1')           // bold
      .replace(/\*([^*]+)\*/g, '$1')               // italic
      .replace(/`([^`]+)`/g, '$1')                 // inline code
      .trim()
    if (clean) paraLines.push(clean)
  }
  flushPara()

  const wordCount = sections.reduce((n, s) => n + s.content.split(' ').length, 0)
  const isLikelyEmpty = wordCount < 50 && sections.length < 3

  // Markdown source has no JSON-LD available
  return { title, metaDesc, sections, schemaTypes: [], wordCount, isLikelyEmpty }
}
