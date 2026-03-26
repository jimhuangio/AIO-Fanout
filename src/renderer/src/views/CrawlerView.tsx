import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { CrawlStats, CrawledPageRow } from '../../../../types'

type CrawlStatus = 'idle' | 'running' | 'paused'

export function CrawlerView(): JSX.Element {
  const { project } = useAppStore()
  const queryClient = useQueryClient()
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>('idle')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error' | 'empty'>('all')

  // Live crawl stats (polled + pushed via event)
  const { data: stats } = useQuery<CrawlStats>({
    queryKey: ['crawl', 'stats'],
    queryFn: () => window.api.getCrawlStats(),
    enabled: !!project,
    refetchInterval: crawlStatus === 'running' ? 3000 : false
  })

  // Crawled pages table
  const { data: pages = [] } = useQuery<CrawledPageRow[]>({
    queryKey: ['crawl', 'pages', statusFilter],
    queryFn: () => window.api.getCrawledPages(500, 0),
    enabled: !!project,
    refetchInterval: crawlStatus === 'running' ? 5000 : false,
    select: (rows) => {
      if (statusFilter === 'all') return rows
      if (statusFilter === 'ok') return rows.filter((r) => r.statusCode === 200 && !r.errorMsg)
      if (statusFilter === 'error') return rows.filter((r) => !!r.errorMsg || (r.statusCode !== null && r.statusCode !== 200))
      if (statusFilter === 'empty') return rows.filter((r) => r.sectionCount === 0 && !r.errorMsg)
      return rows
    }
  })

  // Subscribe to real-time crawl progress events
  useEffect(() => {
    const unsub = window.api.onCrawlProgress(() => {
      queryClient.invalidateQueries({ queryKey: ['crawl'] })
    })
    return unsub
  }, [queryClient])

  const handleStart = useCallback(async () => {
    await window.api.startCrawl()
    setCrawlStatus('running')
    queryClient.invalidateQueries({ queryKey: ['crawl'] })
  }, [queryClient])

  const handlePause = useCallback(async () => {
    await window.api.pauseCrawl()
    setCrawlStatus('paused')
  }, [])

  const handleResume = useCallback(async () => {
    await window.api.resumeCrawl()
    setCrawlStatus('running')
  }, [])

  const handleStop = useCallback(async () => {
    await window.api.stopCrawl()
    setCrawlStatus('idle')
    queryClient.invalidateQueries({ queryKey: ['crawl'] })
  }, [queryClient])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Open a project to use the crawler.
      </div>
    )
  }

  const crawled = stats?.crawled ?? 0
  const total = stats?.total ?? 0
  const errors = stats?.errors ?? 0
  const pending = stats?.pending ?? 0
  // Count both successful and errored pages toward completion
  const done = crawled + errors
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const isComplete = total > 0 && pending === 0 && crawlStatus !== 'running'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 flex items-center gap-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Crawler</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Fetch AIO source URLs and match snippets to page sections
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {crawlStatus === 'idle' && (
            <button
              onClick={handleStart}
              disabled={total === 0}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors font-medium"
            >
              Start crawl
            </button>
          )}
          {crawlStatus === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded transition-colors"
              >
                Pause
              </button>
              <button
                onClick={handleStop}
                className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded transition-colors"
              >
                Stop
              </button>
            </>
          )}
          {crawlStatus === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium"
              >
                Resume
              </button>
              <button
                onClick={handleStop}
                className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded transition-colors"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex-shrink-0 grid grid-cols-5 gap-px bg-gray-200 border-b border-gray-200">
        <StatCard label="Total URLs" value={total} />
        <StatCard label="Crawled" value={crawled} highlight />
        <StatCard label="Matched" value={stats?.matched ?? 0} highlight />
        <StatCard label="Errors" value={errors} error={errors > 0} />
        <StatCard label="Remaining" value={pending} />
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex-shrink-0 px-6 py-2 border-b border-gray-200 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${errors > 0 && isComplete ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{pct}%</span>
          {crawlStatus === 'running' && (
            <span className="text-xs text-blue-500 animate-pulse">crawling…</span>
          )}
          {isComplete && errors === 0 && (
            <span className="text-xs text-green-600 font-medium">Complete</span>
          )}
          {isComplete && errors > 0 && (
            <span className="text-xs text-amber-600 font-medium">
              Complete · {errors.toLocaleString()} error{errors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex-shrink-0 flex gap-1 px-6 pt-3 pb-0 border-b border-gray-200 bg-gray-50">
        {(['all', 'ok', 'error', 'empty'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors capitalize
              ${statusFilter === f
                ? 'bg-white text-gray-900 border border-b-0 border-gray-200 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
              }`}
          >
            {f === 'ok' ? '200 OK' : f === 'empty' ? 'Empty/JS' : f}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-gray-400 pb-1">
          {pages.length.toLocaleString()} rows
        </span>
      </div>

      {/* Pages table */}
      <div className="flex-1 overflow-auto bg-white">
        {pages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {total === 0
              ? 'No AIO sources to crawl yet — run the fanout first.'
              : 'No pages match this filter.'}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-12">#</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-16">Status</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">URL</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-20">Sections</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-20">Matches</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-32">Title</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Schema Types</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium w-36">Error</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page, i) => (
                <PageRow key={page.id} page={page} index={i} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function PageRow({ page, index }: { page: CrawledPageRow; index: number }): JSX.Element {
  const isError = !!page.errorMsg || (page.statusCode !== null && page.statusCode !== 200)
  const isEmpty = page.sectionCount === 0 && !page.errorMsg

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors
        ${isError ? 'bg-red-50/50' : isEmpty ? 'bg-amber-50/30' : ''}
      `}
    >
      <td className="px-4 py-2 text-gray-400 tabular-nums">{index + 1}</td>
      <td className="px-4 py-2">
        <StatusBadge code={page.statusCode} hasError={!!page.errorMsg} />
      </td>
      <td className="px-4 py-2 max-w-0">
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline truncate block"
          title={page.url}
        >
          {page.url}
        </a>
      </td>
      <td className="px-4 py-2 text-gray-500 tabular-nums text-center">
        {page.sectionCount > 0 ? page.sectionCount : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2 tabular-nums text-center">
        {page.matchCount > 0
          ? <span className="text-green-600 font-medium">{page.matchCount}</span>
          : <span className="text-gray-300">—</span>
        }
      </td>
      <td className="px-4 py-2 text-gray-500 truncate max-w-0" title={page.title ?? ''}>
        {page.title || <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2">
        {page.schemaTypes && page.schemaTypes.length > 0
          ? <div className="flex flex-wrap gap-1">
              {page.schemaTypes.map(t => (
                <span key={t} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded text-xs font-mono whitespace-nowrap">
                  {t}
                </span>
              ))}
            </div>
          : <span className="text-gray-300">—</span>
        }
      </td>
      <td className="px-4 py-2 text-red-500 truncate max-w-0" title={page.errorMsg ?? ''}>
        {page.errorMsg || <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

function StatusBadge({
  code,
  hasError
}: {
  code: number | null
  hasError: boolean
}): JSX.Element {
  if (code === null) return <span className="text-gray-300">—</span>

  const color =
    code === 200 && !hasError
      ? 'text-green-600'
      : code >= 500
      ? 'text-red-500'
      : code >= 400
      ? 'text-amber-500'
      : code >= 300
      ? 'text-blue-500'
      : 'text-gray-500'

  return <span className={`tabular-nums font-mono ${color}`}>{code}</span>
}

function StatCard({
  label,
  value,
  highlight,
  error
}: {
  label: string
  value: number
  highlight?: boolean
  error?: boolean
}): JSX.Element {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums mt-0.5
          ${error ? 'text-red-500' : highlight ? 'text-blue-600' : 'text-gray-800'}
        `}
      >
        {value.toLocaleString()}
      </div>
    </div>
  )
}
