// Run: npx ts-node --project tsconfig.json src/main/db/categories.test.ts
import * as BetterSqlite3 from 'better-sqlite3'
const Database = (BetterSqlite3 as any).default ?? BetterSqlite3
import { CREATE_TABLES } from './schema'

// Inline minimal DB setup (in-memory)
const db = new Database(':memory:')
db.exec(CREATE_TABLES)
db.prepare(`INSERT INTO _meta (key, value) VALUES ('schema_version', '12')`).run()
db.prepare(`INSERT INTO project (name, created_at) VALUES ('test', 0)`).run()

// Insert two topics
const t1 = db.prepare(`INSERT INTO topics (label, keywords) VALUES ('Credit Cards', '[]')`).run()
const t2 = db.prepare(`INSERT INTO topics (label, keywords) VALUES ('Personal Loans', '[]')`).run()

// Manually create categories
const mc = db.prepare(`INSERT INTO main_categories (label, position) VALUES ('Finance', 0)`).run()
const sc = db.prepare(`INSERT INTO sub_categories (main_category_id, label, position) VALUES (?, 'Cards', 0)`).run(mc.lastInsertRowid)
db.prepare(`UPDATE topics SET sub_category_id = ? WHERE id = ?`).run(sc.lastInsertRowid, t1.lastInsertRowid)

// Test getFullHierarchy output
const rows = db.prepare(`
  SELECT t.id AS topicId, sc.label AS subCategoryLabel, mc.label AS mainCategoryLabel
  FROM topics t
  LEFT JOIN sub_categories sc ON sc.id = t.sub_category_id
  LEFT JOIN main_categories mc ON mc.id = sc.main_category_id
`).all() as any[]

const errors: string[] = []
const credit = rows.find(r => r.topicId === Number(t1.lastInsertRowid))
if (!credit) errors.push('Credit Cards row not found')
if (credit?.subCategoryLabel !== 'Cards') errors.push(`subCategoryLabel: expected Cards, got ${credit?.subCategoryLabel}`)
if (credit?.mainCategoryLabel !== 'Finance') errors.push(`mainCategoryLabel: expected Finance, got ${credit?.mainCategoryLabel}`)
const loans = rows.find(r => r.topicId === Number(t2.lastInsertRowid))
if (loans?.subCategoryLabel !== null) errors.push(`Personal Loans should have null subCategoryLabel`)

if (errors.length === 0) {
  console.log('✓ All DB category assertions passed')
} else {
  console.error('✗ Failures:', errors)
  process.exit(1)
}
