import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdtempSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
import {
  openProject,
  createProject,
  closeProject,
  updateProjectSettings,
  getProjectMeta,
  getProjectStats,
  getDB,
  insertRootKeywords,
  getKeywordRows,
  getKeywordsForDomain,
  getDomainPositions,
  getOrganicPositions,
  getDomainSuggestions,
  getJobCounts,
  getAIOPositionReport,
  getAIODomainPivot,
  getContentSourceReport,
  getAIOSourcesForKeyword,
  getPAAQuestionsForKeyword,
  getChildKeywordsFor,
  getSerpResultRaw,
  getCrawlStats,
  getCrawledPageRows,
  getSnippetMatchesForKeyword,
  getKeywordsMatchingSnippet,
  getFeaturedSnippetKeywordIds,
  getClusterableKeywords,
  clearTopics,
  clearProjectData,
  insertTopics,
  getTopics,
  getTopicKeywords,
  updateTopicLabel,
  getTopicAIOSnippets,
  getTopicElementBreakdown,
  getTopicSchemaCounts,
  getFullHierarchy,
  updateTopicCategory,
  moveSubCategory,
  renameMainCategory,
  renameSubCategory,
  reorderCategories,
  createMainCategory,
  createSubCategory,
  getTopicIdsForMain,
  getTopicIdsForSub,
  getMainCategoryLabel,
  getSubCategoryLabel,
} from '../db'
import { runClustering, runCategorisation } from '../topics/run'
import { runEnrichment } from '../fanout/enrich'
import { testGeminiKey, generateContentBrief } from '../gemini/client'
import { firecrawlTestKey } from '../crawler/firecrawl-client'
import { buildReportHTML, buildBriefHTML } from '../report/builder'
import { crawlScheduler } from '../crawler/scheduler'
import { mcpClient, DataForSEOClient } from '../mcp/client'
import { scheduler } from '../fanout/scheduler'
import { readAllCredentials, saveServiceCredentials, removeServiceCredentials } from '../credentials'
import type { RunConfig } from '../../types'
import type { FlatHierarchyRow } from '../db'
import type { TopicRow } from '../../types'

function flatRowToTopicRow(row: FlatHierarchyRow): TopicRow {
  return {
    id: row.topicId,
    label: row.topicLabel,
    memberCount: row.memberCount,
    avgSimilarity: row.avgSimilarity,
    topKeywords: row.topKeywords,
    topDomain: row.topDomain,
    topDomainCount: row.topDomainCount,
    bestDomain: row.bestDomain,
    bestDomainPosition: row.bestDomainPosition,
    totalSearchVolume: row.totalSearchVolume,
  }
}

// Resolves an export file path: uses project exportDir if set and writable,
// otherwise falls back to a temp directory.
function resolveExportPath(filename: string, tmpPrefix: string): string {
  try {
    const { exportDir } = getProjectMeta()
    if (exportDir) {
      if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })
      return join(exportDir, filename)
    }
  } catch {
    // project not open or exportDir not set — fall through to temp
  }
  return join(mkdtempSync(join(tmpdir(), tmpPrefix)), filename)
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // ─── Project ───────────────────────────────────────────────────────────────

  ipcMain.handle('project:create', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Create New Project',
      defaultPath: 'New Project.aio-project.db',
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db'] }]
    })
    if (!filePath) return null
    // Derive project name from the chosen filename
    const basename = filePath.split(/[\\/]/).pop() ?? 'Project'
    const name = basename.replace(/\.aio-project\.db$/i, '').replace(/\.db$/i, '').trim() || 'Project'
    return createProject(filePath, name)
  })

  ipcMain.handle('project:open', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Open Project',
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db', 'db'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null
    const meta = openProject(filePaths[0])
    const win = getWindow()
    if (win) scheduler.setWindow(win)
    return meta
  })

  ipcMain.handle('project:close', () => {
    scheduler.stop()
    crawlScheduler.stop()
    mcpClient.disconnect()
    closeProject()
  })

  ipcMain.handle('project:getMeta', () => getProjectMeta())
  ipcMain.handle('project:getStats', () => getProjectStats())

  ipcMain.handle('project:updateSettings', (_e, settings) => {
    updateProjectSettings(settings)
    return getProjectMeta()
  })

  ipcMain.handle('project:clearData', () => {
    crawlScheduler.stop()
    clearProjectData()
  })

  // ─── MCP Connection ────────────────────────────────────────────────────────

  // Test a specific API key without needing a project open
  ipcMain.handle('mcp:testKey', async (_e, apiKey: string) => {
    const client = new DataForSEOClient()
    client.connect(apiKey)
    await client.testConnection()
    return { ok: true }
  })

  ipcMain.handle('mcp:connect', async () => {
    const globalDfs = readAllCredentials()['dataforseo'] ?? {}
    // Try project settings first, then global store
    let apiKey = globalDfs.apiKey
      || (globalDfs.login && globalDfs.password ? btoa(`${globalDfs.login}:${globalDfs.password}`) : '')
    try {
      const meta = getProjectMeta()
      apiKey = meta.dfsApiKey || apiKey
    } catch { /* no project open — use global key */ }
    if (!apiKey) {
      throw new Error('DataForSEO API key not configured — add it in Setup → API Credentials')
    }
    mcpClient.connect(apiKey)
    await mcpClient.testConnection()
    return { connected: true }
  })

  ipcMain.handle('mcp:disconnect', () => {
    mcpClient.disconnect()
  })

  ipcMain.handle('mcp:isConnected', () => ({ connected: mcpClient.isConnected() }))

  // ─── Keywords ─────────────────────────────────────────────────────────────

  ipcMain.handle('keywords:insert', (_e, rawText: string) => {
    const lines = rawText
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const count = insertRootKeywords(lines)
    return { inserted: count, total: lines.length }
  })

  ipcMain.handle('keywords:getRows', (_e, limit = 500, offset = 0) => {
    return getKeywordRows(limit, offset)
  })

  ipcMain.handle('keywords:getForDomain', (_e, domain: string) => {
    return getKeywordsForDomain(domain)
  })

  ipcMain.handle('keywords:getDomainPositions', (_e, domain: string) => {
    return getDomainPositions(domain)
  })

  ipcMain.handle('keywords:getOrganicPositions', (_e, domain: string) => {
    return getOrganicPositions(domain)
  })

  ipcMain.handle('keywords:domainSuggestions', (_e, partial: string) => {
    return getDomainSuggestions(partial)
  })

  ipcMain.handle('keywords:getJobCounts', () => getJobCounts())


  // ─── Run control ──────────────────────────────────────────────────────────

  ipcMain.handle('run:start', async (_e, config: Partial<RunConfig> = {}) => {
    if (!mcpClient.isConnected()) {
      const meta = getProjectMeta()
      const globalDfs = readAllCredentials()['dataforseo'] ?? {}
      const apiKey = meta.dfsApiKey
        || globalDfs.apiKey
        || (globalDfs.login && globalDfs.password ? btoa(`${globalDfs.login}:${globalDfs.password}`) : '')
      if (!apiKey) throw new Error('DataForSEO API key not configured')
      mcpClient.connect(apiKey)
    }
    const win = getWindow()
    if (win) scheduler.setWindow(win)
    await scheduler.start()
    return { started: true }
  })

  ipcMain.handle('run:pause', () => {
    scheduler.pause()
    return { paused: true }
  })

  ipcMain.handle('run:resume', async () => {
    scheduler.resume()
    return { resumed: true }
  })

  ipcMain.handle('run:stop', () => {
    scheduler.stop()
    return { stopped: true }
  })

  // ─── Reports ──────────────────────────────────────────────────────────────

  ipcMain.handle('report:aioPositions', (_e, useSubdomain: boolean) => {
    return getAIOPositionReport(useSubdomain)
  })

  ipcMain.handle('report:aioDomainPivot', (_e, useSubdomain: boolean) => {
    return getAIODomainPivot(useSubdomain)
  })

  ipcMain.handle('report:contentSources', (_e, useSubdomain: boolean) => {
    return getContentSourceReport(useSubdomain)
  })

  // ─── Keyword detail ───────────────────────────────────────────────────────

  ipcMain.handle('keyword:aioSources', (_e, keywordId: number) => {
    return getAIOSourcesForKeyword(keywordId)
  })

  ipcMain.handle('keyword:paaQuestions', (_e, keywordId: number) => {
    return getPAAQuestionsForKeyword(keywordId)
  })

  ipcMain.handle('keyword:children', (_e, keywordId: number) => {
    return getChildKeywordsFor(keywordId)
  })

  ipcMain.handle('keyword:rawJson', (_e, keywordId: number, resultType: string) => {
    return getSerpResultRaw(keywordId, resultType)
  })

  // ─── CSV upload ───────────────────────────────────────────────────────────

  ipcMain.handle('keywords:uploadCSV', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Import Keywords CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null

    const { readFileSync } = await import('fs')
    const raw = readFileSync(filePaths[0], 'utf-8').replace(/^\uFEFF/, '') // strip BOM
    const lines = raw.split(/\r?\n/)

    // Detect keyword column: first column of first data row, or column named 'keyword'
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
    const kwColIdx = header.indexOf('keyword') !== -1 ? header.indexOf('keyword') : 0
    const hasHeader = isNaN(Number(header[0])) && header[0].length > 0

    const keywords = lines
      .slice(hasHeader ? 1 : 0)
      .map((line) => {
        const cols = line.split(',')
        return cols[kwColIdx]?.trim().replace(/^"|"$/g, '') ?? ''
      })
      .filter((kw) => kw.length > 0)

    const count = insertRootKeywords(keywords)
    return { inserted: count, total: keywords.length }
  })

  // ─── Export ───────────────────────────────────────────────────────────────

  ipcMain.handle('export:csv', async (_e, table: string, useSubdomain: boolean) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: `fanout-${table}-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!filePath) return null

    let rows: unknown[] = []
    if (table === 'aio-positions') rows = getAIOPositionReport(useSubdomain)
    if (table === 'aio-pivot') rows = getAIODomainPivot(useSubdomain)

    if (rows.length === 0) return null

    const headers = Object.keys(rows[0] as object).join(',')
    const body = rows.map((r) => Object.values(r as object).join(',')).join('\n')
    writeFileSync(filePath, `${headers}\n${body}`, 'utf-8')
    return filePath
  })

  ipcMain.handle('keywords:exportWithDomains', async (_e, domains: string[]) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Keywords CSV',
      defaultPath: `fanout-keywords-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!filePath) return null

    const keywords = getKeywordRows(Number.MAX_SAFE_INTEGER, 0)  // no cap — export all
    if (keywords.length === 0) return null

    // Build domain position maps
    const aioDomainMaps: Record<string, Record<number, number>> = {}
    const organicDomainMaps: Record<string, Record<number, number>> = {}
    for (const domain of domains) {
      const aioRows = getDomainPositions(domain)
      aioDomainMaps[domain] = Object.fromEntries(aioRows.map(r => [r.keywordId, r.position]))
      const organicRows = getOrganicPositions(domain)
      organicDomainMaps[domain] = Object.fromEntries(organicRows.map(r => [r.keywordId, r.position]))
    }

    // Build headers
    const baseHeaders = ['id', 'keyword', 'status', 'search_volume', 'search_intent', 'depth']
    const domainHeaders = domains.flatMap(d => [`aio_${d}`, `organic_${d}`])
    const headers = [...baseHeaders, ...domainHeaders]

    // Build rows
    const rows = keywords.map(kw => {
      const base = [kw.id, `"${kw.keyword.replace(/"/g, '""')}"`, kw.status, kw.searchVolume ?? '', kw.searchIntent ?? '', kw.depth]
      const domainCols = domains.flatMap(d => [
        aioDomainMaps[d]?.[kw.id] ?? '',
        organicDomainMaps[d]?.[kw.id] ?? ''
      ])
      return [...base, ...domainCols].join(',')
    })

    writeFileSync(filePath, [headers.join(','), ...rows].join('\n'), 'utf-8')
    return filePath
  })

  ipcMain.handle('export:projectCopy', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Project Copy',
      defaultPath: `fanout-backup-${Date.now()}.aio-project.db`,
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db'] }]
    })
    if (!filePath) return null
    // Use better-sqlite3's built-in backup API for safe hot copy
    const db = getDB()
    await (db as any).backup(filePath)
    return filePath
  })

  // ─── Crawler ──────────────────────────────────────────────────────────────

  ipcMain.handle('crawl:start', async () => {
    const win = getWindow()
    if (win) crawlScheduler.setWindow(win)
    await crawlScheduler.start()
    return { started: true }
  })

  ipcMain.handle('crawl:pause', () => {
    crawlScheduler.pause()
    return { paused: true }
  })

  ipcMain.handle('crawl:resume', () => {
    crawlScheduler.resume()
    return { resumed: true }
  })

  ipcMain.handle('crawl:stop', () => {
    crawlScheduler.stop()
    return { stopped: true }
  })

  ipcMain.handle('crawl:getStats', () => getCrawlStats())

  ipcMain.handle('crawl:getPages', (_e, limit = 500, offset = 0) => {
    return getCrawledPageRows(limit, offset)
  })

  ipcMain.handle('crawl:snippetMatches', (_e, keywordId: number) => {
    return getSnippetMatchesForKeyword(keywordId)
  })

  ipcMain.handle('keywords:snippetSearch', (_e, term: string) => {
    return getKeywordsMatchingSnippet(term)
  })

  ipcMain.handle('keywords:featuredSnippets', () => {
    return getFeaturedSnippetKeywordIds()
  })

  // ─── Topics ───────────────────────────────────────────────────────────────

  ipcMain.handle('topics:run', async () => {
    const inputs = getClusterableKeywords()
    const clusters = await runClustering(inputs)
    clearTopics()
    insertTopics(clusters)
    // Auto-categorise after clustering — fires async, no await needed in IPC handler
    // because categorisation is best-effort and we don't want to block the UI response.
    // When done, it fires topics:updated so the renderer refreshes the hierarchy.
    runCategorisation().then(() => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('topics:updated')
    }).catch(() => {
      // categorisation is non-critical — still notify renderer to refresh topics
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('topics:updated')
    })
    return { count: clusters.length }
  })

  ipcMain.handle('gemini:testKey', async (_e, apiKey: string) => {
    await testGeminiKey(apiKey)
    return { ok: true }
  })

  ipcMain.handle('firecrawl:testKey', async (_e, apiKey: string) => {
    await firecrawlTestKey(apiKey)
    return { ok: true }
  })

  ipcMain.handle('topics:getAll', () => getTopics())

  ipcMain.handle('topics:getKeywords', (_e, topicId: number) => getTopicKeywords(topicId))

  ipcMain.handle('topics:updateLabel', (_e, topicId: number, label: string) => {
    updateTopicLabel(topicId, label)
  })

  // ─── Categories ───────────────────────────────────────────────────────────────

  ipcMain.handle('categories:getHierarchy', () => {
    const rows = getFullHierarchy()

    // Group flat rows into nested CategoryHierarchy
    const mainMap = new Map<number, {
      id: number; label: string; position: number; totalSearchVolume: number
      subCategories: Map<number, {
        id: number; mainCategoryId: number; label: string; position: number; totalSearchVolume: number
        topDomain: string | null; bestDomain: string | null; bestDomainPosition: number | null
        topics: import('../../types').TopicRow[]
      }>
    }>()

    const uncategorised: import('../../types').TopicRow[] = []

    for (const row of rows) {
      if (row.mainCategoryId === null || row.subCategoryId === null) {
        uncategorised.push(flatRowToTopicRow(row))
        continue
      }

      if (!mainMap.has(row.mainCategoryId)) {
        mainMap.set(row.mainCategoryId, {
          id: row.mainCategoryId,
          label: row.mainCategoryLabel!,
          position: row.mainCategoryPosition!,
          totalSearchVolume: 0,
          subCategories: new Map()
        })
      }
      const mc = mainMap.get(row.mainCategoryId)!

      if (!mc.subCategories.has(row.subCategoryId)) {
        mc.subCategories.set(row.subCategoryId, {
          id: row.subCategoryId,
          mainCategoryId: row.mainCategoryId,
          label: row.subCategoryLabel!,
          position: row.subCategoryPosition!,
          totalSearchVolume: 0,
          topDomain: row.topDomain,
          bestDomain: row.bestDomain,
          bestDomainPosition: row.bestDomainPosition,
          topics: []
        })
      }
      const sc = mc.subCategories.get(row.subCategoryId)!
      sc.topics.push(flatRowToTopicRow(row))
      sc.totalSearchVolume += row.totalSearchVolume ?? 0
      mc.totalSearchVolume += row.totalSearchVolume ?? 0
    }

    return {
      mainCategories: Array.from(mainMap.values())
        .sort((a, b) => a.position - b.position)
        .map(mc => ({
          ...mc,
          subCategories: Array.from(mc.subCategories.values())
            .sort((a, b) => a.position - b.position)
        })),
      uncategorised
    }
  })

  ipcMain.handle('categories:updateTopicCategory', (_e, topicId: number, subCategoryId: number) => {
    updateTopicCategory(topicId, subCategoryId)
  })

  ipcMain.handle('categories:moveSubCategory', (_e, subCategoryId: number, mainCategoryId: number) => {
    moveSubCategory(subCategoryId, mainCategoryId)
  })

  ipcMain.handle('categories:renameMain', (_e, id: number, label: string) => {
    renameMainCategory(id, label)
  })

  ipcMain.handle('categories:renameSub', (_e, id: number, label: string) => {
    renameSubCategory(id, label)
  })

  ipcMain.handle('categories:reorder', (_e, updates: { id: number; level: 'main' | 'sub'; position: number }[]) => {
    reorderCategories(updates)
  })

  ipcMain.handle('categories:createMain', (_e, label: string) => {
    return createMainCategory(label)
  })

  ipcMain.handle('categories:createSub', (_e, label: string, mainCategoryId: number) => {
    return createSubCategory(label, mainCategoryId)
  })

  // ─── Re-enrich on demand ──────────────────────────────────────────────────

  ipcMain.handle('run:enrich', async (_e, win?: BrowserWindow) => {
    const window = getWindow()
    let done = 0
    await runEnrichment(
      () => false,
      (d, total) => {
        done = d
        if (window && !window.isDestroyed()) {
          window.webContents.send('enrich:progress', { done: d, total })
        }
      }
    )
    if (window && !window.isDestroyed()) {
      window.webContents.send('run:complete')
    }
    return { done }
  })

  // ─── Export folder picker ─────────────────────────────────────────────────

  ipcMain.handle('project:selectExportDir', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Export Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ─── Content Brief ────────────────────────────────────────────────────────

  ipcMain.handle('topics:generateBrief', async (_e, topicId: number) => {
    const creds = readAllCredentials()
    const apiKey = creds['gemini']?.apiKey ?? ''
    if (!apiKey) throw new Error('Gemini API key not configured — add it in Setup → API Credentials')

    const topics   = getTopics()
    const topic    = topics.find(t => t.id === topicId)
    if (!topic) throw new Error('Topic not found')

    const keywords  = getTopicKeywords(topicId)
    const snippets  = getTopicAIOSnippets(topicId)
    const brief = await generateContentBrief(topic.label, keywords, snippets, topic.topDomain ?? null, apiKey)

    const html = buildBriefHTML(topic.label, brief, keywords)
    const filePath = resolveExportPath(
      `${topic.label.replace(/[^a-z0-9]/gi, '_')}_Content_Brief.html`,
      'fanout-brief-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)

    return { brief, filePath }
  })

  // ─── Report ───────────────────────────────────────────────────────────────

  ipcMain.handle('report:generate', async () => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const topics = getTopics()

    const topicData = topics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id),
      elements: getTopicElementBreakdown(topic.id),
      schemas: getTopicSchemaCounts(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })

    const filePath = resolveExportPath(
      `${meta.name.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`,
      'fanout-report-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })

  ipcMain.handle('report:generateForMain', async (_e, mainCategoryId: number) => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const allTopics = getTopics()

    const topicIds = getTopicIdsForMain(mainCategoryId)
    const filteredTopics = allTopics.filter(t => topicIds.includes(t.id))
    const label = getMainCategoryLabel(mainCategoryId) ?? `Category_${mainCategoryId}`

    const topicData = filteredTopics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id),
      elements: getTopicElementBreakdown(topic.id),
      schemas: getTopicSchemaCounts(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })
    const filePath = resolveExportPath(
      `${label.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`,
      'fanout-report-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })

  ipcMain.handle('report:generateForSub', async (_e, subCategoryId: number) => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const allTopics = getTopics()

    const topicIds = getTopicIdsForSub(subCategoryId)
    const filteredTopics = allTopics.filter(t => topicIds.includes(t.id))
    const label = getSubCategoryLabel(subCategoryId) ?? `SubCategory_${subCategoryId}`

    const topicData = filteredTopics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id),
      elements: getTopicElementBreakdown(topic.id),
      schemas: getTopicSchemaCounts(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })
    const filePath = resolveExportPath(
      `${label.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`,
      'fanout-report-'
    )
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })

  // ─── Scrapling installer ──────────────────────────────────────────────────

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  ipcMain.handle('scrapling:status', async () => {
    let python = false
    let scrapling = false
    try {
      await execAsync(`${pythonCmd} --version`)
      python = true
    } catch { /* python not found */ }
    if (python) {
      try {
        await execAsync(`${pythonCmd} -c "import scrapling"`)
        scrapling = true
      } catch { /* not installed */ }
    }
    return { python, scrapling }
  })

  ipcMain.handle('scrapling:install', async () => {
    try {
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} -m pip install scrapling`,
        { timeout: 180_000 }
      )
      return { ok: true, output: (stdout + '\n' + stderr).trim() }
    } catch (err: any) {
      return { ok: false, output: (err.stdout ?? '') + (err.stderr ?? '') || err.message }
    }
  })

  ipcMain.handle('scrapling:installBrowsers', async () => {
    try {
      const { stdout, stderr } = await execAsync(
        'scrapling install',
        { timeout: 300_000 }
      )
      return { ok: true, output: (stdout + '\n' + stderr).trim() }
    } catch (err: any) {
      return { ok: false, output: (err.stdout ?? '') + (err.stderr ?? '') || err.message }
    }
  })

  // ─── Global API Credentials ───────────────────────────────────────────────

  ipcMain.handle('credentials:getAll', () => readAllCredentials())

  ipcMain.handle('credentials:save', (_e, service: string, fields: Record<string, string>) => {
    saveServiceCredentials(service, fields)
  })

  ipcMain.handle('credentials:remove', (_e, service: string) => {
    removeServiceCredentials(service)
  })
}
