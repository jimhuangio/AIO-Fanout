import { contextBridge, ipcRenderer } from 'electron'
import type {
  ProjectMeta,
  ProjectStats,
  JobCounts,
  AIOPositionRow,
  AIODomainPivotRow,
  ContentSourceRow,
  KeywordRow,
  RunConfig,
  CrawlStats,
  CrawledPageRow,
  SnippetMatchRow,
  TopicRow,
  TopicKeywordRow,
  ContentBrief,
  CategoryHierarchy
} from '../types'

const api = {
  // ─── Project ───────────────────────────────────────────────────────────────
  createProject: (): Promise<ProjectMeta | null> =>
    ipcRenderer.invoke('project:create'),

  openProject: (): Promise<ProjectMeta | null> =>
    ipcRenderer.invoke('project:open'),

  closeProject: (): Promise<void> =>
    ipcRenderer.invoke('project:close'),

  getProjectMeta: (): Promise<ProjectMeta> =>
    ipcRenderer.invoke('project:getMeta'),

  getProjectStats: (): Promise<ProjectStats> =>
    ipcRenderer.invoke('project:getStats'),

  updateProjectSettings: (settings: Partial<ProjectMeta>): Promise<ProjectMeta> =>
    ipcRenderer.invoke('project:updateSettings', settings),

  clearProjectData: (): Promise<void> =>
    ipcRenderer.invoke('project:clearData'),

  // ─── MCP ──────────────────────────────────────────────────────────────────
  mcpTestKey: (apiKey: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mcp:testKey', apiKey),

  geminiTestKey: (apiKey: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('gemini:testKey', apiKey),

  firecrawlTestKey: (apiKey: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('firecrawl:testKey', apiKey),

  mcpConnect: (): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke('mcp:connect'),

  mcpDisconnect: (): Promise<void> =>
    ipcRenderer.invoke('mcp:disconnect'),

  mcpIsConnected: (): Promise<{ connected: boolean }> =>
    ipcRenderer.invoke('mcp:isConnected'),


  // ─── Keywords ─────────────────────────────────────────────────────────────
  insertKeywords: (rawText: string): Promise<{ inserted: number; total: number }> =>
    ipcRenderer.invoke('keywords:insert', rawText),

  getKeywordRows: (limit?: number, offset?: number): Promise<KeywordRow[]> =>
    ipcRenderer.invoke('keywords:getRows', limit, offset),

  getKeywordsForDomain: (domain: string): Promise<KeywordRow[]> =>
    ipcRenderer.invoke('keywords:getForDomain', domain),

  getDomainPositions: (domain: string): Promise<{ keywordId: number; position: number }[]> =>
    ipcRenderer.invoke('keywords:getDomainPositions', domain),

  getOrganicPositionsForDomain: (domain: string): Promise<{ keywordId: number; position: number }[]> =>
    ipcRenderer.invoke('keywords:getOrganicPositions', domain),

  exportKeywordsCSV: (domains: string[]): Promise<string | null> =>
    ipcRenderer.invoke('keywords:exportWithDomains', domains),

  getDomainSuggestions: (partial: string): Promise<string[]> =>
    ipcRenderer.invoke('keywords:domainSuggestions', partial),

  getJobCounts: (): Promise<JobCounts> =>
    ipcRenderer.invoke('keywords:getJobCounts'),

  // ─── Run control ──────────────────────────────────────────────────────────
  startRun: (config?: Partial<RunConfig>): Promise<{ started: boolean }> =>
    ipcRenderer.invoke('run:start', config),

  pauseRun: (): Promise<{ paused: boolean }> =>
    ipcRenderer.invoke('run:pause'),

  resumeRun: (): Promise<{ resumed: boolean }> =>
    ipcRenderer.invoke('run:resume'),

  stopRun: (): Promise<{ stopped: boolean }> =>
    ipcRenderer.invoke('run:stop'),

  // Subscribe to progress events from main process
  onRunProgress: (callback: (counts: JobCounts) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, counts: JobCounts): void => callback(counts)
    ipcRenderer.on('run:progress', handler)
    return () => ipcRenderer.removeListener('run:progress', handler)
  },

  // Fired when the run completes naturally (enrichment done, scheduler self-stopped)
  onRunComplete: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('run:complete', handler)
    return () => ipcRenderer.removeListener('run:complete', handler)
  },

  // ─── Reports ──────────────────────────────────────────────────────────────
  getAIOPositionReport: (useSubdomain: boolean): Promise<AIOPositionRow[]> =>
    ipcRenderer.invoke('report:aioPositions', useSubdomain),

  getAIODomainPivot: (useSubdomain: boolean): Promise<AIODomainPivotRow[]> =>
    ipcRenderer.invoke('report:aioDomainPivot', useSubdomain),

  getContentSourceReport: (useSubdomain: boolean): Promise<ContentSourceRow[]> =>
    ipcRenderer.invoke('report:contentSources', useSubdomain),

  // ─── Keyword detail ───────────────────────────────────────────────────────
  getKeywordAIOSources: (keywordId: number) =>
    ipcRenderer.invoke('keyword:aioSources', keywordId),

  getKeywordPAAQuestions: (keywordId: number) =>
    ipcRenderer.invoke('keyword:paaQuestions', keywordId),

  getKeywordChildren: (keywordId: number) =>
    ipcRenderer.invoke('keyword:children', keywordId),

  getKeywordRawJson: (keywordId: number, resultType: string): Promise<string | null> =>
    ipcRenderer.invoke('keyword:rawJson', keywordId, resultType),

  // ─── CSV upload ───────────────────────────────────────────────────────────
  uploadKeywordsCSV: (): Promise<{ inserted: number; total: number } | null> =>
    ipcRenderer.invoke('keywords:uploadCSV'),

  // ─── Export ───────────────────────────────────────────────────────────────
  exportCSV: (table: string, useSubdomain: boolean): Promise<string | null> =>
    ipcRenderer.invoke('export:csv', table, useSubdomain),

  exportProjectCopy: (): Promise<string | null> =>
    ipcRenderer.invoke('export:projectCopy'),

  // ─── Crawler ──────────────────────────────────────────────────────────────
  startCrawl: (): Promise<{ started: boolean }> =>
    ipcRenderer.invoke('crawl:start'),

  pauseCrawl: (): Promise<{ paused: boolean }> =>
    ipcRenderer.invoke('crawl:pause'),

  resumeCrawl: (): Promise<{ resumed: boolean }> =>
    ipcRenderer.invoke('crawl:resume'),

  stopCrawl: (): Promise<{ stopped: boolean }> =>
    ipcRenderer.invoke('crawl:stop'),

  getCrawlStats: (): Promise<CrawlStats> =>
    ipcRenderer.invoke('crawl:getStats'),

  getCrawledPages: (limit?: number, offset?: number): Promise<CrawledPageRow[]> =>
    ipcRenderer.invoke('crawl:getPages', limit, offset),

  getSnippetMatches: (keywordId: number): Promise<SnippetMatchRow[]> =>
    ipcRenderer.invoke('crawl:snippetMatches', keywordId),

  snippetSearch: (term: string): Promise<{ keywordId: number; snippet: string }[]> =>
    ipcRenderer.invoke('keywords:snippetSearch', term),

  getFeaturedSnippetIds: (): Promise<{ keywordId: number; snippetType: string }[]> =>
    ipcRenderer.invoke('keywords:featuredSnippets'),

  onCrawlProgress: (callback: (stats: CrawlStats) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, stats: CrawlStats): void => callback(stats)
    ipcRenderer.on('crawl:progress', handler)
    return () => ipcRenderer.removeListener('crawl:progress', handler)
  },

  // ─── Topics ───────────────────────────────────────────────────────────────
  onTopicsUpdated: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('topics:updated', handler)
    return () => ipcRenderer.removeListener('topics:updated', handler)
  },

  runTopicClustering: (): Promise<{ count: number }> =>
    ipcRenderer.invoke('topics:run'),

  getTopics: (): Promise<TopicRow[]> =>
    ipcRenderer.invoke('topics:getAll'),

  getTopicKeywords: (topicId: number): Promise<TopicKeywordRow[]> =>
    ipcRenderer.invoke('topics:getKeywords', topicId),

  updateTopicLabel: (topicId: number, label: string): Promise<void> =>
    ipcRenderer.invoke('topics:updateLabel', topicId, label),

  generateTopicBrief: (topicId: number): Promise<{ brief: ContentBrief; filePath: string }> =>
    ipcRenderer.invoke('topics:generateBrief', topicId),

  // ─── Categories ───────────────────────────────────────────────────────────────
  getCategoryHierarchy: (): Promise<CategoryHierarchy> =>
    ipcRenderer.invoke('categories:getHierarchy'),

  updateTopicCategory: (topicId: number, subCategoryId: number): Promise<void> =>
    ipcRenderer.invoke('categories:updateTopicCategory', topicId, subCategoryId),

  moveSubCategory: (subCategoryId: number, mainCategoryId: number): Promise<void> =>
    ipcRenderer.invoke('categories:moveSubCategory', subCategoryId, mainCategoryId),

  renameMainCategory: (id: number, label: string): Promise<void> =>
    ipcRenderer.invoke('categories:renameMain', id, label),

  renameSubCategory: (id: number, label: string): Promise<void> =>
    ipcRenderer.invoke('categories:renameSub', id, label),

  reorderCategories: (updates: { id: number; level: 'main' | 'sub'; position: number }[]): Promise<void> =>
    ipcRenderer.invoke('categories:reorder', updates),

  createMainCategory: (label: string): Promise<number> =>
    ipcRenderer.invoke('categories:createMain', label),

  createSubCategory: (label: string, mainCategoryId: number): Promise<number> =>
    ipcRenderer.invoke('categories:createSub', label, mainCategoryId),

  generateReportForMain: (mainCategoryId: number): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('report:generateForMain', mainCategoryId),

  generateReportForSub: (subCategoryId: number): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('report:generateForSub', subCategoryId),

  runEnrichment: (): Promise<{ done: number }> =>
    ipcRenderer.invoke('run:enrich'),

  selectExportDir: (): Promise<string | null> =>
    ipcRenderer.invoke('project:selectExportDir'),

  onEnrichProgress: (callback: (data: { done: number; total: number }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { done: number; total: number }): void => callback(data)
    ipcRenderer.on('enrich:progress', handler)
    return () => ipcRenderer.removeListener('enrich:progress', handler)
  },

  // ─── Report ───────────────────────────────────────────────────────────────
  generateReport: (): Promise<{ filePath: string }> =>
    ipcRenderer.invoke('report:generate'),

  // ─── Scrapling installer ──────────────────────────────────────────────────
  scraplingStatus: (): Promise<{ python: boolean; scrapling: boolean }> =>
    ipcRenderer.invoke('scrapling:status'),

  scraplingInstall: (): Promise<{ ok: boolean; output: string }> =>
    ipcRenderer.invoke('scrapling:install'),

  scraplingInstallBrowsers: (): Promise<{ ok: boolean; output: string }> =>
    ipcRenderer.invoke('scrapling:installBrowsers'),

  // ─── Global API Credentials ───────────────────────────────────────────────
  getAllCredentials: (): Promise<Record<string, Record<string, string>>> =>
    ipcRenderer.invoke('credentials:getAll'),

  saveCredentials: (service: string, fields: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('credentials:save', service, fields),

  removeCredentials: (service: string): Promise<void> =>
    ipcRenderer.invoke('credentials:remove', service)
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer TypeScript
declare global {
  interface Window {
    api: typeof api
  }
}
