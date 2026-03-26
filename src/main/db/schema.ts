// All CREATE TABLE statements for a project DB.
// Run once on project creation; migrations handle schema changes.

export const SCHEMA_VERSION = 12

export const CREATE_TABLES = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-65536;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  dfs_login           TEXT NOT NULL DEFAULT '',
  dfs_password        TEXT NOT NULL DEFAULT '',
  dfs_api_key         TEXT NOT NULL DEFAULT '',
  location_code       INTEGER NOT NULL DEFAULT 2840,
  language_code       TEXT NOT NULL DEFAULT 'en',
  device              TEXT NOT NULL DEFAULT 'desktop',
  fan_out_depth       INTEGER NOT NULL DEFAULT 2,
  fan_out_cap         INTEGER NOT NULL DEFAULT 99,
  child_source        TEXT NOT NULL DEFAULT 'none',
  exclusion_keywords  TEXT NOT NULL DEFAULT '[]',
  export_dir          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS keywords (
  id            INTEGER PRIMARY KEY,
  keyword       TEXT NOT NULL,
  parent_id     INTEGER REFERENCES keywords(id),
  depth         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  queued_at     INTEGER,
  started_at    INTEGER,
  done_at       INTEGER,
  error_msg     TEXT,
  search_volume INTEGER,
  search_intent TEXT,
  category_id   INTEGER,
  category_name TEXT,
  UNIQUE(keyword)
);

CREATE INDEX IF NOT EXISTS idx_kw_status ON keywords(status);
CREATE INDEX IF NOT EXISTS idx_kw_parent ON keywords(parent_id);
CREATE INDEX IF NOT EXISTS idx_kw_depth  ON keywords(depth);

CREATE TABLE IF NOT EXISTS serp_results (
  id           INTEGER PRIMARY KEY,
  keyword_id   INTEGER NOT NULL REFERENCES keywords(id),
  result_type  TEXT NOT NULL,
  raw_json     TEXT NOT NULL,
  fetched_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sr_keyword ON serp_results(keyword_id, result_type);

CREATE TABLE IF NOT EXISTS aio_sources (
  id            INTEGER PRIMARY KEY,
  keyword_id    INTEGER NOT NULL REFERENCES keywords(id),
  position      INTEGER NOT NULL,
  url           TEXT NOT NULL,
  domain_root   TEXT NOT NULL,
  domain_full   TEXT NOT NULL,
  aio_snippet   TEXT,
  result_type   TEXT NOT NULL DEFAULT 'aio'
);

CREATE INDEX IF NOT EXISTS idx_as_keyword  ON aio_sources(keyword_id);
CREATE INDEX IF NOT EXISTS idx_as_domain_r ON aio_sources(domain_root, position);
CREATE INDEX IF NOT EXISTS idx_as_domain_f ON aio_sources(domain_full, position);

CREATE TABLE IF NOT EXISTS paa_questions (
  id         INTEGER PRIMARY KEY,
  keyword_id INTEGER NOT NULL REFERENCES keywords(id),
  question   TEXT NOT NULL,
  position   INTEGER,
  ai_answer  TEXT,
  depth      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paa_keyword ON paa_questions(keyword_id);

CREATE TABLE IF NOT EXISTS fanout_edges (
  parent_keyword_id INTEGER NOT NULL REFERENCES keywords(id),
  child_keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
  source            TEXT NOT NULL,
  PRIMARY KEY(parent_keyword_id, child_keyword_id)
);

CREATE TABLE IF NOT EXISTS crawled_pages (
  id           INTEGER PRIMARY KEY,
  url          TEXT NOT NULL UNIQUE,
  status_code  INTEGER,
  title        TEXT,
  meta_desc    TEXT,
  raw_html     TEXT,
  crawled_at   INTEGER NOT NULL,
  error_msg    TEXT,
  schema_types TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS page_sections (
  id            INTEGER PRIMARY KEY,
  page_id       INTEGER NOT NULL REFERENCES crawled_pages(id),
  section_type  TEXT NOT NULL,
  content       TEXT NOT NULL,
  position_idx  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ps_page ON page_sections(page_id);

CREATE TABLE IF NOT EXISTS snippet_matches (
  id              INTEGER PRIMARY KEY,
  aio_source_id   INTEGER NOT NULL REFERENCES aio_sources(id),
  page_section_id INTEGER NOT NULL REFERENCES page_sections(id),
  match_score     REAL NOT NULL,
  match_method    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sm_source ON snippet_matches(aio_source_id);

CREATE TABLE IF NOT EXISTS main_categories (
  id       INTEGER PRIMARY KEY,
  label    TEXT    NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sub_categories (
  id               INTEGER PRIMARY KEY,
  main_category_id INTEGER NOT NULL REFERENCES main_categories(id),
  label            TEXT    NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS topics (
  id       INTEGER PRIMARY KEY,
  label    TEXT NOT NULL,
  keywords TEXT NOT NULL,
  centroid TEXT,
  sub_category_id INTEGER REFERENCES sub_categories(id)
);

CREATE TABLE IF NOT EXISTS topic_keywords (
  topic_id   INTEGER NOT NULL REFERENCES topics(id),
  keyword_id INTEGER NOT NULL REFERENCES keywords(id),
  similarity REAL,
  PRIMARY KEY(topic_id, keyword_id)
);

CREATE TABLE IF NOT EXISTS organic_rankings (
  id          INTEGER PRIMARY KEY,
  keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
  domain_root TEXT    NOT NULL,
  domain_full TEXT    NOT NULL,
  position    INTEGER NOT NULL,
  url         TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_or_keyword_domain
  ON organic_rankings(keyword_id, domain_root);
`

export const MIGRATIONS: Record<number, string> = {
  2: `ALTER TABLE project ADD COLUMN dfs_api_key TEXT NOT NULL DEFAULT '';`,
  3: [
    `CREATE INDEX IF NOT EXISTS idx_as_url ON aio_sources(url);`,
    `CREATE INDEX IF NOT EXISTS idx_ps_page_pos ON page_sections(page_id, position_idx);`
  ].join('\n'),
  4: [
    `ALTER TABLE keywords ADD COLUMN search_volume INTEGER;`,
    `ALTER TABLE keywords ADD COLUMN search_intent TEXT;`
  ].join('\n'),
  // Repair migration: re-runs the same ALTERs for databases created at v4
  // without the columns (CREATE_TABLES was missing them). Errors are swallowed
  // by the migration runner for "duplicate column name" — safe to run twice.
  5: [
    `ALTER TABLE keywords ADD COLUMN search_volume INTEGER;`,
    `ALTER TABLE keywords ADD COLUMN search_intent TEXT;`
  ].join('\n'),
  6: [
    `ALTER TABLE keywords ADD COLUMN category_id INTEGER;`,
    `ALTER TABLE keywords ADD COLUMN category_name TEXT;`
  ].join('\n'),
  7: `ALTER TABLE project ADD COLUMN child_source TEXT NOT NULL DEFAULT 'none';`,
  8: `ALTER TABLE project ADD COLUMN export_dir TEXT NOT NULL DEFAULT '';`,
  // Remap old fan_out_cap=0 (previously "unlimited") to 99 (new "unlimited")
  9: `UPDATE project SET fan_out_cap = 99 WHERE fan_out_cap = 0;`,
  10: `ALTER TABLE crawled_pages ADD COLUMN schema_types TEXT NOT NULL DEFAULT '[]';`,
  11: [
    `CREATE TABLE IF NOT EXISTS organic_rankings (
      id          INTEGER PRIMARY KEY,
      keyword_id  INTEGER NOT NULL REFERENCES keywords(id),
      domain_root TEXT    NOT NULL,
      domain_full TEXT    NOT NULL,
      position    INTEGER NOT NULL,
      url         TEXT    NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_or_keyword_domain
       ON organic_rankings(keyword_id, domain_root)`
  ].join(';\n'),
  12: [
    `CREATE TABLE IF NOT EXISTS main_categories (
      id       INTEGER PRIMARY KEY,
      label    TEXT    NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS sub_categories (
      id               INTEGER PRIMARY KEY,
      main_category_id INTEGER NOT NULL REFERENCES main_categories(id),
      label            TEXT    NOT NULL,
      position         INTEGER NOT NULL DEFAULT 0
    )`,
    `ALTER TABLE topics ADD COLUMN sub_category_id INTEGER REFERENCES sub_categories(id)`
  ].join(';\n')
}
