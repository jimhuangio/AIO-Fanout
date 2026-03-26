import Database from 'better-sqlite3'
import { CREATE_TABLES, MIGRATIONS, SCHEMA_VERSION } from './schema'
import type { ProjectMeta, AIOPositionRow, AIODomainPivotRow, ProjectStats, KeywordRow, TopicRow, TopicKeywordRow, ContentSourceRow } from '../../types'
import type { ClusterInput, Cluster } from '../topics/cluster'

let _db: Database.Database | null = null

export function getDB(): Database.Database {
  if (!_db) throw new Error('No project open')
  return _db
}

// ─── Open or create a project DB ─────────────────────────────────────────────

export function openProject(filePath: string): ProjectMeta {
  if (_db) _db.close()

  _db = new Database(filePath)
  _db.exec(CREATE_TABLES)
  runMigrations(_db)


  const row = _db.prepare('SELECT * FROM project LIMIT 1').get() as any
  if (!row) throw new Error('Project file has no project row — may be corrupt')

  return rowToProjectMeta(row)
}

export function createProject(filePath: string, name: string): ProjectMeta {
  if (_db) _db.close()

  _db = new Database(filePath)
  _db.exec(CREATE_TABLES)

  _db.prepare(`
    INSERT INTO _meta (key, value) VALUES ('schema_version', ?)
  `).run(String(SCHEMA_VERSION))

  _db.prepare(`
    INSERT INTO project (name, created_at) VALUES (?, ?)
  `).run(name, Date.now())

  const row = _db.prepare('SELECT * FROM project LIMIT 1').get() as any
  return rowToProjectMeta(row)
}

export function closeProject(): void {
  _db?.close()
  _db = null
}

// ─── Migrations ───────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  const versionRow = db.prepare(`SELECT value FROM _meta WHERE key='schema_version'`).get() as any
  let current = versionRow ? parseInt(versionRow.value, 10) : 1

  while (current < SCHEMA_VERSION) {
    const next = current + 1
    const sql = MIGRATIONS[next]
    if (sql) {
      // Execute each statement separately to avoid partial-failure issues.
      // Swallow "duplicate column name" errors so repair migrations (which
      // re-run ALTER TABLE ADD COLUMN) are safe to run on already-patched DBs.
      for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
        try {
          db.exec(stmt + ';')
        } catch (err) {
          if (!String(err).includes('duplicate column name')) throw err
        }
      }
    }
    db.prepare(`INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)`).run(String(next))
    current = next
  }
}

// ─── Project settings ─────────────────────────────────────────────────────────

export function updateProjectSettings(settings: Partial<ProjectMeta>): void {
  const db = getDB()
  const fields: string[] = []
  const values: unknown[] = []

  const colMap: Record<string, string> = {
    name: 'name',
    dfsApiKey: 'dfs_api_key',
    dfsLogin: 'dfs_login',
    dfsPassword: 'dfs_password',
    locationCode: 'location_code',
    languageCode: 'language_code',
    device: 'device',
    fanOutDepth: 'fan_out_depth',
    fanOutCap: 'fan_out_cap',
    childSource: 'child_source',
    exclusionKeywords: 'exclusion_keywords',
    exportDir: 'export_dir'
  }

  for (const [key, col] of Object.entries(colMap)) {
    if (key in settings) {
      fields.push(`${col} = ?`)
      const val = settings[key as keyof ProjectMeta]
      values.push(Array.isArray(val) ? JSON.stringify(val) : val)
    }
  }

  if (fields.length === 0) return
  db.prepare(`UPDATE project SET ${fields.join(', ')} WHERE id = 1`).run(...values)
}

export function getProjectMeta(): ProjectMeta {
  const row = getDB().prepare('SELECT * FROM project LIMIT 1').get() as any
  return rowToProjectMeta(row)
}

function rowToProjectMeta(row: any): ProjectMeta {
  const dfsLogin    = row.dfs_login ?? ''
  const dfsPassword = row.dfs_password ?? ''
  // Derive apiKey from legacy login/password if not stored directly
  const dfsApiKey   = row.dfs_api_key || (dfsLogin && dfsPassword ? btoa(`${dfsLogin}:${dfsPassword}`) : '')
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    dfsApiKey,
    dfsLogin,
    dfsPassword,
    locationCode: row.location_code ?? 2840,
    languageCode: row.language_code ?? 'en',
    device: row.device ?? 'desktop',
    fanOutDepth: row.fan_out_depth ?? 2,
    fanOutCap: row.fan_out_cap ?? 99,
    childSource: (row.child_source ?? 'none') as ProjectMeta['childSource'],
    exclusionKeywords: JSON.parse(row.exclusion_keywords ?? '[]'),
    exportDir: row.export_dir ?? ''
  }
}

// ─── Keyword management ───────────────────────────────────────────────────────

export function insertRootKeywords(keywords: string[]): number {
  const db = getDB()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO keywords (keyword, depth, status)
    VALUES (?, 0, 'pending')
  `)
  const tx = db.transaction((kws: string[]) => {
    let count = 0
    for (const kw of kws) {
      const info = insert.run(kw.toLowerCase().trim())
      count += info.changes
    }
    return count
  })
  return tx(keywords) as number
}

export function getPendingKeywords(): { id: number; keyword: string; depth: number }[] {
  return getDB()
    .prepare(`SELECT id, keyword, depth FROM keywords WHERE status = 'pending'`)
    .all() as { id: number; keyword: string; depth: number }[]
}

export function markKeywordQueued(id: number): void {
  getDB().prepare(`UPDATE keywords SET status='queued', queued_at=? WHERE id=?`).run(Date.now(), id)
}

export function markKeywordRunning(id: number): void {
  getDB()
    .prepare(`UPDATE keywords SET status='running', started_at=? WHERE id=?`)
    .run(Date.now(), id)
}

export function markKeywordDone(id: number): void {
  getDB().prepare(`UPDATE keywords SET status='done', done_at=? WHERE id=?`).run(Date.now(), id)
}

export function markKeywordError(id: number, msg: string): void {
  getDB()
    .prepare(`UPDATE keywords SET status='error', error_msg=?, done_at=? WHERE id=?`)
    .run(msg, Date.now(), id)
}

export function getKeyword(id: number): { id: number; keyword: string; depth: number } {
  return getDB().prepare(`SELECT id, keyword, depth FROM keywords WHERE id=?`).get(id) as {
    id: number
    keyword: string
    depth: number
  }
}

export function getKeywordRows(limit = 500, offset = 0): KeywordRow[] {
  return getDB()
    .prepare(
      `SELECT
        k.id, k.keyword, k.depth, k.status, k.parent_id as parentId,
        k.done_at as doneAt, k.error_msg as errorMsg,
        k.search_volume as searchVolume, k.search_intent as searchIntent,
        COUNT(a.id) as aioSourceCount
      FROM keywords k
      LEFT JOIN aio_sources a ON a.keyword_id = k.id
      GROUP BY k.id
      ORDER BY k.id
      LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as KeywordRow[]
}


// Returns keywords where the given domain (partial match) appears in AIO sources,
// with the best (lowest) AIO position that domain achieved for each keyword.
export function getKeywordsForDomain(domain: string): KeywordRow[] {
  const like = `%${domain}%`
  return getDB()
    .prepare(
      `SELECT
        k.id, k.keyword, k.depth, k.status, k.parent_id as parentId,
        k.done_at as doneAt, k.error_msg as errorMsg,
        (SELECT COUNT(*) FROM aio_sources WHERE keyword_id = k.id) as aioSourceCount,
        MIN(a.position) as domainPosition
      FROM keywords k
      JOIN aio_sources a ON a.keyword_id = k.id
        AND (a.domain_root LIKE ? OR a.domain_full LIKE ?)
      GROUP BY k.id
      ORDER BY domainPosition ASC
      LIMIT 2000`
    )
    .all(like, like) as KeywordRow[]
}

// Returns the best AIO position per keyword for a given domain (partial match).
// Used to build per-domain comparison columns in the keyword table.
export function getDomainPositions(domain: string): { keywordId: number; position: number }[] {
  const like = `%${domain}%`
  return getDB()
    .prepare(
      `SELECT keyword_id as keywordId, MIN(position) as position
       FROM aio_sources
       WHERE domain_root LIKE ? OR domain_full LIKE ?
       GROUP BY keyword_id`
    )
    .all(like, like) as { keywordId: number; position: number }[]
}

// Returns the organic position per keyword for a given domain (partial match).
// Used to build per-domain organic rank columns in the keyword table.
export function getOrganicPositions(domain: string): { keywordId: number; position: number }[] {
  const like = `%${domain}%`
  return getDB()
    .prepare(
      `SELECT keyword_id as keywordId, MIN(position) as position
       FROM organic_rankings
       WHERE domain_root LIKE ? OR domain_full LIKE ?
       GROUP BY keyword_id`
    )
    .all(like, like) as { keywordId: number; position: number }[]
}

// Returns distinct domain_root values that partially match the given string.
// Used for the keyword domain-filter autocomplete.
export function getDomainSuggestions(partial: string): string[] {
  const like = `%${partial}%`
  const rows = getDB()
    .prepare(
      `SELECT domain_root as domain, COUNT(*) as cnt
       FROM aio_sources
       WHERE domain_root LIKE ?
       GROUP BY domain_root
       ORDER BY cnt DESC
       LIMIT 12`
    )
    .all(like) as { domain: string }[]
  return rows.map((r) => r.domain)
}

export function getJobCounts() {
  const rows = getDB()
    .prepare(`SELECT status, COUNT(*) as cnt FROM keywords GROUP BY status`)
    .all() as { status: string; cnt: number }[]

  const counts = { pending: 0, queued: 0, running: 0, done: 0, error: 0 }
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] = r.cnt
  }
  return counts
}

// ─── AIO source management ────────────────────────────────────────────────────

export function insertSerpResult(
  keywordId: number,
  resultType: string,
  rawJson: string
): void {
  getDB()
    .prepare(`INSERT INTO serp_results (keyword_id, result_type, raw_json, fetched_at) VALUES (?,?,?,?)`)
    .run(keywordId, resultType, rawJson, Date.now())
}

export function insertAIOSources(
  keywordId: number,
  sources: {
    position: number
    url: string
    domainRoot: string
    domainFull: string
    aioSnippet: string | null
    resultType: string
  }[]
): void {
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO aio_sources (keyword_id, position, url, domain_root, domain_full, aio_snippet, result_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const s of sources) {
      insert.run(keywordId, s.position, s.url, s.domainRoot, s.domainFull, s.aioSnippet, s.resultType)
    }
  })
  tx()
}

export function insertOrganicRankings(
  keywordId: number,
  rankings: { domainRoot: string; domainFull: string; position: number; url: string }[]
): void {
  if (rankings.length === 0) return
  const db = getDB()
  const stmt = db.prepare(
    `INSERT INTO organic_rankings (keyword_id, domain_root, domain_full, position, url)
     VALUES (?, ?, ?, ?, ?)`
  )
  const tx = db.transaction(() => {
    for (const r of rankings) {
      stmt.run(keywordId, r.domainRoot, r.domainFull, r.position, r.url)
    }
  })
  tx()
}

export function insertPAAQuestions(
  keywordId: number,
  depth: number,
  questions: { question: string; position: number; aiAnswer: string | null }[]
): void {
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO paa_questions (keyword_id, question, position, ai_answer, depth)
    VALUES (?, ?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const q of questions) {
      insert.run(keywordId, q.question, q.position, q.aiAnswer, depth)
    }
  })
  tx()
}

// Insert child keywords, return IDs of newly inserted ones
export function insertChildKeywords(
  children: { keyword: string; source: string }[],
  parentId: number,
  parentDepth: number,
  exclusions: string[]
): number[] {
  const db = getDB()
  const insertKw = db.prepare(`
    INSERT OR IGNORE INTO keywords (keyword, parent_id, depth, status)
    VALUES (?, ?, ?, 'pending')
  `)
  const insertEdge = db.prepare(`
    INSERT OR IGNORE INTO fanout_edges (parent_keyword_id, child_keyword_id, source)
    VALUES (?, ?, ?)
  `)
  const getByKw = db.prepare(`SELECT id FROM keywords WHERE keyword = ?`)
  const newIds: number[] = []

  const tx = db.transaction(() => {
    for (const child of children) {
      const kw = child.keyword.toLowerCase().trim()
      if (!kw) continue
      // Exclusion filter: skip if keyword contains any exclusion phrase
      if (exclusions.some((ex) => kw.includes(ex.toLowerCase()))) continue

      const info = insertKw.run(kw, parentId, parentDepth + 1)
      const childId =
        info.changes > 0
          ? Number(info.lastInsertRowid)
          : (getByKw.get(kw) as { id: number }).id

      insertEdge.run(parentId, childId, child.source)
      if (info.changes > 0) newIds.push(childId)
    }
  })
  tx()
  return newIds
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function getProjectStats(): ProjectStats {
  const row = getDB().prepare(`
    SELECT
      (SELECT COUNT(*) FROM keywords)                                      AS totalKeywords,
      (SELECT COUNT(DISTINCT keyword_id) FROM aio_sources)                 AS keywordsWithAIO,
      (SELECT COUNT(DISTINCT domain_root) FROM aio_sources)                AS uniqueDomains,
      (SELECT SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) FROM keywords) AS pendingKeywords,
      (SELECT SUM(CASE WHEN status='done'    THEN 1 ELSE 0 END) FROM keywords) AS doneKeywords,
      (SELECT SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END) FROM keywords) AS errorKeywords
  `).get() as any
  return {
    totalKeywords:    row.totalKeywords    ?? 0,
    keywordsWithAIO:  row.keywordsWithAIO  ?? 0,
    uniqueDomains:    row.uniqueDomains    ?? 0,
    pendingKeywords:  row.pendingKeywords  ?? 0,
    doneKeywords:     row.doneKeywords     ?? 0,
    errorKeywords:    row.errorKeywords    ?? 0
  }
}

export function getAIOPositionReport(useSubdomain: boolean): AIOPositionRow[] {
  const db = getDB()
  const domainCol = useSubdomain ? 'domain_full' : 'domain_root'
  const { total } = db
    .prepare(`SELECT COUNT(DISTINCT keyword_id) as total FROM aio_sources`)
    .get() as { total: number }

  if (total === 0) return []

  return db
    .prepare(
      `SELECT
        position,
        ${domainCol}                                          AS domain,
        COUNT(*)                                              AS appearances,
        COUNT(DISTINCT keyword_id)                            AS uniqueKeywords,
        ROUND(COUNT(DISTINCT keyword_id) * 100.0 / ?, 2)     AS sharePct
      FROM aio_sources
      WHERE position BETWEEN 1 AND 10
      GROUP BY position, ${domainCol}
      ORDER BY position ASC, appearances DESC`
    )
    .all(total) as AIOPositionRow[]
}

export function getAIODomainPivot(useSubdomain: boolean): AIODomainPivotRow[] {
  const domainCol = useSubdomain ? 'domain_full' : 'domain_root'
  return getDB()
    .prepare(
      `SELECT
        ${domainCol}                                          AS domain,
        SUM(CASE WHEN position=1  THEN 1 ELSE 0 END)         AS pos1,
        SUM(CASE WHEN position=2  THEN 1 ELSE 0 END)         AS pos2,
        SUM(CASE WHEN position=3  THEN 1 ELSE 0 END)         AS pos3,
        SUM(CASE WHEN position=4  THEN 1 ELSE 0 END)         AS pos4,
        SUM(CASE WHEN position=5  THEN 1 ELSE 0 END)         AS pos5,
        SUM(CASE WHEN position=6  THEN 1 ELSE 0 END)         AS pos6,
        SUM(CASE WHEN position=7  THEN 1 ELSE 0 END)         AS pos7,
        SUM(CASE WHEN position=8  THEN 1 ELSE 0 END)         AS pos8,
        SUM(CASE WHEN position=9  THEN 1 ELSE 0 END)         AS pos9,
        SUM(CASE WHEN position=10 THEN 1 ELSE 0 END)         AS pos10,
        COUNT(*)                                              AS totalAppearances,
        SUM(11 - position)                                    AS visibilityScore
      FROM aio_sources
      WHERE position BETWEEN 1 AND 10
      GROUP BY ${domainCol}
      ORDER BY visibilityScore DESC
      LIMIT 300`
    )
    .all() as AIODomainPivotRow[]
}

export function getContentSourceReport(useSubdomain: boolean): ContentSourceRow[] {
  const domainCol = useSubdomain ? 'domain_full' : 'domain_root'
  return getDB()
    .prepare(
      `SELECT
        a.${domainCol}                                                            AS domain,
        SUM(CASE WHEN ps.section_type = 'h1'         THEN 1 ELSE 0 END)         AS h1,
        SUM(CASE WHEN ps.section_type = 'h2'         THEN 1 ELSE 0 END)         AS h2,
        SUM(CASE WHEN ps.section_type = 'h3'         THEN 1 ELSE 0 END)         AS h3,
        SUM(CASE WHEN ps.section_type = 'h4'         THEN 1 ELSE 0 END)         AS h4,
        SUM(CASE WHEN ps.section_type = 'h5'         THEN 1 ELSE 0 END)         AS h5,
        SUM(CASE WHEN ps.section_type = 'h6'         THEN 1 ELSE 0 END)         AS h6,
        SUM(CASE WHEN ps.section_type = 'p'          THEN 1 ELSE 0 END)         AS p,
        SUM(CASE WHEN ps.section_type = 'li'         THEN 1 ELSE 0 END)         AS li,
        SUM(CASE WHEN ps.section_type = 'blockquote' THEN 1 ELSE 0 END)         AS blockquote,
        SUM(CASE WHEN ps.section_type = 'title'      THEN 1 ELSE 0 END)         AS title,
        SUM(CASE WHEN ps.section_type = 'metaDesc'   THEN 1 ELSE 0 END)         AS metaDesc,
        COUNT(*)                                                                  AS totalMatches
      FROM snippet_matches sm
      JOIN page_sections ps ON ps.id = sm.page_section_id
      JOIN aio_sources a    ON a.id  = sm.aio_source_id
      GROUP BY a.${domainCol}
      ORDER BY totalMatches DESC
      LIMIT 300`
    )
    .all() as ContentSourceRow[]
}

// ─── Keyword detail ───────────────────────────────────────────────────────────

export interface AIOSourceRow {
  id: number
  position: number
  url: string
  domainRoot: string
  domainFull: string
  aioSnippet: string | null
  resultType: string
}

export interface PAAQuestionRow {
  id: number
  question: string
  position: number
  aiAnswer: string | null
}

export interface ChildKeywordRow {
  id: number
  keyword: string
  depth: number
  status: string
  source: string
  aioSourceCount: number
}

export function getAIOSourcesForKeyword(keywordId: number): AIOSourceRow[] {
  return getDB()
    .prepare(
      `SELECT id, position, url, domain_root as domainRoot, domain_full as domainFull,
              aio_snippet as aioSnippet, result_type as resultType
       FROM aio_sources
       WHERE keyword_id = ?
       ORDER BY result_type, position`
    )
    .all(keywordId) as AIOSourceRow[]
}

// Returns one row per keyword that has an aio_snippet containing `term`.
// The snippet returned is the first matching one for that keyword.
export function getKeywordsMatchingSnippet(
  term: string
): { keywordId: number; snippet: string }[] {
  if (!term.trim()) return []
  return getDB()
    .prepare(
      `SELECT keyword_id AS keywordId, aio_snippet AS snippet
       FROM aio_sources
       WHERE aio_snippet LIKE '%' || ? || '%'
       GROUP BY keyword_id`
    )
    .all(term) as { keywordId: number; snippet: string }[]
}

export function getPAAQuestionsForKeyword(keywordId: number): PAAQuestionRow[] {
  return getDB()
    .prepare(
      `SELECT id, question, position, ai_answer as aiAnswer
       FROM paa_questions
       WHERE keyword_id = ?
       ORDER BY position`
    )
    .all(keywordId) as PAAQuestionRow[]
}

export function getChildKeywordsFor(parentId: number): ChildKeywordRow[] {
  return getDB()
    .prepare(
      `SELECT k.id, k.keyword, k.depth, k.status, e.source,
              COUNT(a.id) as aioSourceCount
       FROM keywords k
       JOIN fanout_edges e ON e.child_keyword_id = k.id
       LEFT JOIN aio_sources a ON a.keyword_id = k.id
       WHERE e.parent_keyword_id = ?
       GROUP BY k.id
       ORDER BY k.keyword`
    )
    .all(parentId) as ChildKeywordRow[]
}

// Scans stored raw SERP JSON for featured_snippet / answer_box items.
// Returns one row per keyword that has either type in its SERP response.
export function getFeaturedSnippetKeywordIds(): { keywordId: number; snippetType: string }[] {
  return getDB().prepare(
    `SELECT keyword_id AS keywordId,
            CASE
              WHEN raw_json LIKE '%"type":"answer_box"%'       THEN 'answer_box'
              ELSE 'featured_snippet'
            END AS snippetType
     FROM serp_results
     WHERE result_type = 'serp_advanced'
       AND (raw_json LIKE '%"type":"featured_snippet"%'
            OR raw_json LIKE '%"type":"answer_box"%')`
  ).all() as { keywordId: number; snippetType: string }[]
}

export function getSerpResultRaw(keywordId: number, resultType: string): string | null {
  const row = getDB()
    .prepare(`SELECT raw_json FROM serp_results WHERE keyword_id = ? AND result_type = ? LIMIT 1`)
    .get(keywordId, resultType) as { raw_json: string } | undefined
  return row?.raw_json ?? null
}

// ─── Crawler ──────────────────────────────────────────────────────────────────

export interface CrawledPageRow {
  id: number
  url: string
  domain: string
  statusCode: number | null
  title: string | null
  sectionCount: number
  matchCount: number
  crawledAt: number
  errorMsg: string | null
}

export interface CrawlStats {
  total: number       // unique URLs in aio_sources
  crawled: number     // in crawled_pages with no error
  errors: number      // in crawled_pages with error
  pending: number     // in aio_sources but not in crawled_pages
  matched: number     // pages with at least one snippet match
}

export function getUncrawledAIOUrls(): string[] {
  return (
    getDB()
      .prepare(
        `SELECT DISTINCT a.url
         FROM aio_sources a
         LEFT JOIN crawled_pages c ON c.url = a.url
         WHERE c.url IS NULL`
      )
      .all() as { url: string }[]
  ).map(r => r.url)
}

export function insertCrawledPage(page: {
  url: string
  statusCode: number
  title: string
  metaDesc: string
  errorMsg: string | null
  rawHtml: string | null
  schemaTypes?: string[]
}): number {
  const db = getDB()

  // Upsert: if already exists (re-crawl), update; otherwise insert
  const existing = db.prepare(`SELECT id FROM crawled_pages WHERE url = ?`).get(page.url) as { id: number } | undefined
  if (existing) return existing.id

  const info = db.prepare(`
    INSERT INTO crawled_pages (url, status_code, title, meta_desc, raw_html, crawled_at, error_msg, schema_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    page.url, page.statusCode, page.title, page.metaDesc, page.rawHtml,
    Date.now(), page.errorMsg,
    JSON.stringify(page.schemaTypes ?? [])
  )

  return Number(info.lastInsertRowid)
}

export function insertPageSections(
  pageId: number,
  sections: { sectionType: string; content: string; positionIdx: number }[]
): void {
  const db = getDB()
  const insert = db.prepare(`
    INSERT INTO page_sections (page_id, section_type, content, position_idx)
    VALUES (?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const s of sections) {
      insert.run(pageId, s.sectionType, s.content, s.positionIdx)
    }
  })
  tx()
}

export function insertSnippetMatches(
  pageId: number,
  matches: { aioSourceId: number; positionIdx: number; score: number; method: string }[]
): void {
  const db = getDB()
  const getSectionId = db.prepare(
    `SELECT id FROM page_sections WHERE page_id = ? AND position_idx = ?`
  )
  const insert = db.prepare(`
    INSERT OR REPLACE INTO snippet_matches (aio_source_id, page_section_id, match_score, match_method)
    VALUES (?, ?, ?, ?)
  `)
  const tx = db.transaction(() => {
    for (const m of matches) {
      const sec = getSectionId.get(pageId, m.positionIdx) as { id: number } | undefined
      if (sec) insert.run(m.aioSourceId, sec.id, m.score, m.method)
    }
  })
  tx()
}

// Returns all AIO sources for a given URL (may span many keywords)
export function getAIOSourcesForUrl(
  url: string
): { id: number; aioSnippet: string | null }[] {
  return getDB()
    .prepare(`SELECT id, aio_snippet as aioSnippet FROM aio_sources WHERE url = ?`)
    .all(url) as { id: number; aioSnippet: string | null }[]
}

export function getCrawlStats(): CrawlStats {
  const row = getDB().prepare(`
    SELECT
      (SELECT COUNT(DISTINCT url) FROM aio_sources)                                         AS total,
      (SELECT COUNT(*) FROM crawled_pages WHERE error_msg IS NULL)                          AS crawled,
      (SELECT COUNT(*) FROM crawled_pages WHERE error_msg IS NOT NULL)                      AS errors,
      (SELECT COUNT(DISTINCT p.id) FROM crawled_pages p
       JOIN page_sections s  ON s.page_id = p.id
       JOIN snippet_matches m ON m.page_section_id = s.id)                                  AS matched
  `).get() as any
  const { total, crawled, errors, matched } = row
  return { total, crawled, errors, pending: total - crawled - errors, matched }
}

export function getCrawledPageRows(limit = 500, offset = 0): CrawledPageRow[] {
  return getDB()
    .prepare(
      `SELECT
        p.id,
        p.url,
        SUBSTR(p.url, INSTR(p.url, '://') + 3,
          CASE WHEN INSTR(SUBSTR(p.url, INSTR(p.url,'://')+3), '/') = 0
               THEN LENGTH(p.url)
               ELSE INSTR(SUBSTR(p.url, INSTR(p.url,'://')+3), '/') - 1
          END) AS domain,
        p.status_code as statusCode,
        p.title,
        COUNT(DISTINCT s.id)  AS sectionCount,
        COUNT(DISTINCT sm.id) AS matchCount,
        p.crawled_at as crawledAt,
        p.error_msg as errorMsg,
        p.schema_types as schemaTypesJson
      FROM crawled_pages p
      LEFT JOIN page_sections s  ON s.page_id = p.id
      LEFT JOIN snippet_matches sm ON sm.page_section_id = s.id
      GROUP BY p.id
      ORDER BY p.crawled_at DESC
      LIMIT ? OFFSET ?`
    )
    .all(limit, offset)
    .map((row: any) => ({
      ...row,
      schemaTypes: (() => { try { return JSON.parse(row.schemaTypesJson ?? '[]') } catch { return [] } })()
    })) as CrawledPageRow[]
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export function getClusterableKeywords(): ClusterInput[] {
  const rows = getDB().prepare(
    `SELECT k.id, k.keyword, k.category_id AS categoryId,
            GROUP_CONCAT(DISTINCT a.domain_root) AS domains
     FROM keywords k
     LEFT JOIN aio_sources a ON a.keyword_id = k.id
     WHERE k.status IN ('done', 'error')
     GROUP BY k.id`
  ).all() as { id: number; keyword: string; categoryId: number | null; domains: string | null }[]

  return rows.map(r => ({
    id: r.id,
    keyword: r.keyword,
    categoryId: r.categoryId ?? null,
    domains: r.domains ? r.domains.split(',').filter(Boolean) : []
  }))
}

export function clearTopics(): void {
  const db = getDB()
  db.exec(`
    UPDATE topics SET sub_category_id = NULL;
    DELETE FROM sub_categories;
    DELETE FROM main_categories;
    DELETE FROM topic_keywords;
    DELETE FROM topics;
  `)
}

// ─── Category hierarchy ───────────────────────────────────────────────────────

export interface CategoryHierarchyInput {
  mainCategories: {
    label: string
    subCategories: {
      label: string
      topicIds: number[]
    }[]
  }[]
}

export function clearAndInsertCategories(hierarchy: CategoryHierarchyInput): void {
  const db = getDB()
  const tx = db.transaction(() => {
    // FK-safe reset
    db.exec('UPDATE topics SET sub_category_id = NULL')
    db.exec('DELETE FROM sub_categories')
    db.exec('DELETE FROM main_categories')

    const insertMain = db.prepare(
      `INSERT INTO main_categories (label, position) VALUES (?, ?)`
    )
    const insertSub = db.prepare(
      `INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, ?, ?)`
    )
    const assignTopic = db.prepare(
      `UPDATE topics SET sub_category_id = ? WHERE id = ?`
    )

    hierarchy.mainCategories.forEach((mc, mcPos) => {
      const mcRow = insertMain.run(mc.label, mcPos)
      const mcId = Number(mcRow.lastInsertRowid)

      mc.subCategories.forEach((sc, scPos) => {
        const scRow = insertSub.run(mcId, sc.label, scPos)
        const scId = Number(scRow.lastInsertRowid)

        for (const topicId of sc.topicIds) {
          assignTopic.run(scId, topicId)
        }
      })
    })
  })
  tx()
}

// Wipes all research data for a fresh session.
// Preserves the `project` and `_meta` tables (settings + schema version).
// ─── Keyword enrichment (search volume + intent) ──────────────────────────────

// All done/error keywords that have not yet been enriched with volume or intent.
// category_id is excluded from this check — categories API failures should not
// cause keywords to re-enrich indefinitely.
export function getUnenrichedKeywords(): { id: number; keyword: string }[] {
  return getDB()
    .prepare(
      `SELECT id, keyword FROM keywords
       WHERE status IN ('done', 'error')
         AND (search_volume IS NULL OR search_intent IS NULL)`
    )
    .all() as { id: number; keyword: string }[]
}

export function upsertKeywordEnrichment(
  updates: { id: number; searchVolume: number | null; searchIntent: string | null; categoryId: number | null; categoryName: string | null }[]
): void {
  // COALESCE ensures a null value from a failed API call never overwrites
  // previously-saved good data for that keyword.
  const stmt = getDB().prepare(
    `UPDATE keywords
     SET search_volume = COALESCE(?, search_volume),
         search_intent = COALESCE(?, search_intent),
         category_id   = COALESCE(?, category_id),
         category_name = COALESCE(?, category_name)
     WHERE id = ?`
  )
  const tx = getDB().transaction(() => {
    for (const u of updates) {
      stmt.run(u.searchVolume, u.searchIntent, u.categoryId, u.categoryName, u.id)
    }
  })
  tx()
}

export function getEnrichStats(): { total: number; enriched: number } {
  const row = getDB().prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN search_volume IS NOT NULL OR search_intent IS NOT NULL THEN 1 ELSE 0 END) AS enriched
    FROM keywords
    WHERE status IN ('done', 'error')
  `).get() as any
  return { total: row.total ?? 0, enriched: row.enriched ?? 0 }
}

export function clearProjectData(): void {
  getDB().exec(`
    DELETE FROM organic_rankings;
    DELETE FROM snippet_matches;
    DELETE FROM page_sections;
    DELETE FROM crawled_pages;
    UPDATE topics SET sub_category_id = NULL;
    DELETE FROM sub_categories;
    DELETE FROM main_categories;
    DELETE FROM topic_keywords;
    DELETE FROM topics;
    DELETE FROM fanout_edges;
    DELETE FROM paa_questions;
    DELETE FROM aio_sources;
    DELETE FROM serp_results;
    DELETE FROM keywords;
  `)
}

export function insertTopics(clusters: Cluster[]): void {
  const db = getDB()
  const insertTopic = db.prepare(
    `INSERT INTO topics (label, keywords) VALUES (?, ?)`
  )
  const insertLink = db.prepare(
    `INSERT OR IGNORE INTO topic_keywords (topic_id, keyword_id, similarity) VALUES (?, ?, ?)`
  )
  const tx = db.transaction(() => {
    for (const cluster of clusters) {
      const info = insertTopic.run(cluster.label, JSON.stringify(cluster.keywords))
      const topicId = Number(info.lastInsertRowid)
      for (const m of cluster.members) {
        insertLink.run(topicId, m.id, m.similarity)
      }
    }
  })
  tx()
}

export function getTopics(): TopicRow[] {
  // Pre-aggregate domain stats once, then use window functions to pick top/best per topic.
  // This replaces 4 correlated subqueries that each re-scanned aio_sources per topic row.
  return getDB().prepare(
    `WITH domain_agg AS (
       SELECT tk.topic_id,
              a.domain_root,
              COUNT(*)         AS cnt,
              MIN(a.position)  AS best_pos
       FROM aio_sources a
       JOIN topic_keywords tk ON tk.keyword_id = a.keyword_id
       WHERE a.domain_root != '' AND a.position BETWEEN 1 AND 10
       GROUP BY tk.topic_id, a.domain_root
     ),
     ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY cnt DESC)      AS rn_cnt,
              ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY best_pos ASC)  AS rn_pos
       FROM domain_agg
     )
     SELECT
       t.id,
       t.label,
       COUNT(tk.keyword_id)         AS memberCount,
       ROUND(AVG(tk.similarity), 2) AS avgSimilarity,
       (SELECT GROUP_CONCAT(sub.keyword, '|')
        FROM (SELECT k2.keyword
              FROM topic_keywords tk2
              JOIN keywords k2 ON k2.id = tk2.keyword_id
              WHERE tk2.topic_id = t.id
              ORDER BY tk2.similarity DESC
              LIMIT 5) sub
       ) AS topKeywords,
       td.domain_root  AS topDomain,
       td.cnt          AS topDomainCount,
       bd.domain_root  AS bestDomain,
       bd.best_pos     AS bestDomainPosition,
       SUM(k.search_volume) AS totalSearchVolume
     FROM topics t
     LEFT JOIN topic_keywords tk ON tk.topic_id = t.id
     LEFT JOIN keywords k ON k.id = tk.keyword_id
     LEFT JOIN ranked td ON td.topic_id = t.id AND td.rn_cnt = 1
     LEFT JOIN ranked bd ON bd.topic_id = t.id AND bd.rn_pos = 1
     GROUP BY t.id
     ORDER BY memberCount DESC`
  ).all() as TopicRow[]
}

export interface FlatHierarchyRow {
  topicId: number
  topicLabel: string
  subCategoryId: number | null
  subCategoryLabel: string | null
  subCategoryPosition: number | null
  mainCategoryId: number | null
  mainCategoryLabel: string | null
  mainCategoryPosition: number | null
  memberCount: number
  avgSimilarity: number
  topKeywords: string | null
  topDomain: string | null
  topDomainCount: number | null
  bestDomain: string | null
  bestDomainPosition: number | null
  totalSearchVolume: number | null
}

export function getFullHierarchy(): FlatHierarchyRow[] {
  // Reuse the domain-stats CTE from getTopics(), adding category joins.
  return getDB().prepare(
    `WITH domain_agg AS (
       SELECT tk.topic_id,
              a.domain_root,
              COUNT(*)         AS cnt,
              MIN(a.position)  AS best_pos
       FROM aio_sources a
       JOIN topic_keywords tk ON tk.keyword_id = a.keyword_id
       WHERE a.domain_root != '' AND a.position BETWEEN 1 AND 10
       GROUP BY tk.topic_id, a.domain_root
     ),
     ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY cnt DESC)      AS rn_cnt,
              ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY best_pos ASC)  AS rn_pos
       FROM domain_agg
     )
     SELECT
       t.id                          AS topicId,
       t.label                       AS topicLabel,
       sc.id                         AS subCategoryId,
       sc.label                      AS subCategoryLabel,
       sc.position                   AS subCategoryPosition,
       mc.id                         AS mainCategoryId,
       mc.label                      AS mainCategoryLabel,
       mc.position                   AS mainCategoryPosition,
       COUNT(tk.keyword_id)          AS memberCount,
       ROUND(AVG(tk.similarity), 2)  AS avgSimilarity,
       (SELECT GROUP_CONCAT(sub.keyword, '|')
        FROM (SELECT k2.keyword
              FROM topic_keywords tk2
              JOIN keywords k2 ON k2.id = tk2.keyword_id
              WHERE tk2.topic_id = t.id
              ORDER BY tk2.similarity DESC
              LIMIT 5) sub
       )                             AS topKeywords,
       td.domain_root                AS topDomain,
       td.cnt                        AS topDomainCount,
       bd.domain_root                AS bestDomain,
       bd.best_pos                   AS bestDomainPosition,
       SUM(k.search_volume)          AS totalSearchVolume
     FROM topics t
     LEFT JOIN sub_categories sc ON sc.id = t.sub_category_id
     LEFT JOIN main_categories mc ON mc.id = sc.main_category_id
     LEFT JOIN topic_keywords tk ON tk.topic_id = t.id
     LEFT JOIN keywords k ON k.id = tk.keyword_id
     LEFT JOIN ranked td ON td.topic_id = t.id AND td.rn_cnt = 1
     LEFT JOIN ranked bd ON bd.topic_id = t.id AND bd.rn_pos = 1
     GROUP BY t.id
     ORDER BY mc.position ASC, sc.position ASC, memberCount DESC`
  ).all() as FlatHierarchyRow[]
}

export function getTopicKeywords(topicId: number): TopicKeywordRow[] {
  return getDB().prepare(
    `SELECT k.id, k.keyword, tk.similarity, k.depth,
            COUNT(a.id) AS aioSourceCount,
            k.search_volume AS searchVolume,
            k.search_intent AS searchIntent
     FROM topic_keywords tk
     JOIN keywords k ON k.id = tk.keyword_id
     LEFT JOIN aio_sources a ON a.keyword_id = k.id
     WHERE tk.topic_id = ?
     GROUP BY k.id
     ORDER BY tk.similarity DESC`
  ).all(topicId) as TopicKeywordRow[]
}

export function updateTopicLabel(topicId: number, label: string): void {
  getDB().prepare(`UPDATE topics SET label = ? WHERE id = ?`).run(label, topicId)
}

export function updateTopicCategory(topicId: number, subCategoryId: number): void {
  getDB().prepare(`UPDATE topics SET sub_category_id = ? WHERE id = ?`).run(subCategoryId, topicId)
}

export function moveSubCategory(subCategoryId: number, mainCategoryId: number): void {
  getDB().prepare(`UPDATE sub_categories SET main_category_id = ? WHERE id = ?`).run(mainCategoryId, subCategoryId)
}

export function renameMainCategory(id: number, label: string): void {
  getDB().prepare(`UPDATE main_categories SET label = ? WHERE id = ?`).run(label, id)
}

export function renameSubCategory(id: number, label: string): void {
  getDB().prepare(`UPDATE sub_categories SET label = ? WHERE id = ?`).run(label, id)
}

export function reorderCategories(
  updates: { id: number; level: 'main' | 'sub'; position: number }[]
): void {
  const db = getDB()
  const updateMain = db.prepare(`UPDATE main_categories SET position = ? WHERE id = ?`)
  const updateSub  = db.prepare(`UPDATE sub_categories  SET position = ? WHERE id = ?`)
  const tx = db.transaction(() => {
    for (const u of updates) {
      if (u.level === 'main') updateMain.run(u.position, u.id)
      else updateSub.run(u.position, u.id)
    }
  })
  tx()
}

export function createMainCategory(label: string): number {
  const db = getDB()
  const maxPos = (db.prepare(`SELECT MAX(position) AS p FROM main_categories`).get() as any)?.p ?? -1
  const row = db.prepare(`INSERT INTO main_categories (label, position) VALUES (?, ?)`).run(label, maxPos + 1)
  return Number(row.lastInsertRowid)
}

export function createSubCategory(label: string, mainCategoryId: number): number {
  const db = getDB()
  const maxPos = (db.prepare(
    `SELECT MAX(position) AS p FROM sub_categories WHERE main_category_id = ?`
  ).get(mainCategoryId) as any)?.p ?? -1
  const row = db.prepare(
    `INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, ?, ?)`
  ).run(mainCategoryId, label, maxPos + 1)
  return Number(row.lastInsertRowid)
}

// Returns schema @type → page count for all crawled AIO-source pages tied to a topic.
export function getTopicSchemaCounts(topicId: number): { schemaType: string; count: number }[] {
  const rows = getDB().prepare(
    `SELECT DISTINCT cp.schema_types
     FROM crawled_pages cp
     JOIN aio_sources a   ON a.url          = cp.url
     JOIN topic_keywords tk ON tk.keyword_id = a.keyword_id
     WHERE tk.topic_id = ?
       AND cp.schema_types IS NOT NULL
       AND cp.schema_types != '[]'`
  ).all(topicId) as { schema_types: string }[]

  const counts: Record<string, number> = {}
  for (const row of rows) {
    try {
      const types = JSON.parse(row.schema_types) as string[]
      for (const t of types) counts[t] = (counts[t] ?? 0) + 1
    } catch { /* ignore */ }
  }

  return Object.entries(counts)
    .map(([schemaType, count]) => ({ schemaType, count }))
    .sort((a, b) => b.count - a.count)
}

// Returns HTML element type → match count for all snippet matches tied to a topic's keywords.
// Used in the report to show which elements work best per topic cluster.
export function getTopicElementBreakdown(topicId: number): { sectionType: string; count: number }[] {
  return getDB().prepare(
    `SELECT ps.section_type AS sectionType, COUNT(*) AS count
     FROM snippet_matches sm
     JOIN page_sections ps ON sm.page_section_id = ps.id
     JOIN aio_sources a    ON sm.aio_source_id   = a.id
     JOIN topic_keywords tk ON tk.keyword_id     = a.keyword_id
     WHERE tk.topic_id = ?
     GROUP BY ps.section_type
     ORDER BY count DESC`
  ).all(topicId) as { sectionType: string; count: number }[]
}

// Returns up to 20 non-null AIO snippets for keywords in a topic
export function getTopicAIOSnippets(topicId: number): string[] {
  const rows = getDB().prepare(
    `SELECT DISTINCT a.aio_snippet
     FROM aio_sources a
     JOIN topic_keywords tk ON tk.keyword_id = a.keyword_id
     WHERE tk.topic_id = ? AND a.aio_snippet IS NOT NULL AND a.aio_snippet != ''
     LIMIT 20`
  ).all(topicId) as { aio_snippet: string }[]
  return rows.map(r => r.aio_snippet)
}

// ─── Category report helpers ──────────────────────────────────────────────────

export function getTopicIdsForMain(mainCategoryId: number): number[] {
  const subCatIds = getDB()
    .prepare(`SELECT id FROM sub_categories WHERE main_category_id = ?`)
    .all(mainCategoryId)
    .map((r: any) => r.id as number)
  if (subCatIds.length === 0) return []
  return getDB()
    .prepare(`SELECT id FROM topics WHERE sub_category_id IN (${subCatIds.map(() => '?').join(',')})`)
    .all(...subCatIds)
    .map((r: any) => r.id as number)
}

export function getTopicIdsForSub(subCategoryId: number): number[] {
  return getDB()
    .prepare(`SELECT id FROM topics WHERE sub_category_id = ?`)
    .all(subCategoryId)
    .map((r: any) => r.id as number)
}

export function getMainCategoryLabel(id: number): string | undefined {
  const row = getDB()
    .prepare(`SELECT label FROM main_categories WHERE id = ?`)
    .get(id) as { label: string } | undefined
  return row?.label
}

export function getSubCategoryLabel(id: number): string | undefined {
  const row = getDB()
    .prepare(`SELECT label FROM sub_categories WHERE id = ?`)
    .get(id) as { label: string } | undefined
  return row?.label
}

export function getSnippetMatchesForKeyword(keywordId: number): {
  url: string
  position: number
  sectionType: string
  sectionContent: string
  score: number
}[] {
  return getDB()
    .prepare(
      `SELECT
        a.url, a.position,
        ps.section_type as sectionType,
        ps.content      as sectionContent,
        sm.match_score  as score
      FROM aio_sources a
      JOIN snippet_matches sm ON sm.aio_source_id = a.id
      JOIN page_sections ps  ON ps.id = sm.page_section_id
      WHERE a.keyword_id = ?
      ORDER BY a.position, sm.match_score DESC`
    )
    .all(keywordId) as any[]
}
