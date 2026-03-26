// THE KILLER FEATURE: Position 1-10 AIO source heatmap
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import { DomainModeToggle } from '../components/DomainModeToggle'
import { heatLevel, formatNumber, formatPct } from '../lib/utils'
import type { AIODomainPivotRow, AIOPositionRow, ContentSourceRow } from '../../../types'

const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
const SECTION_TYPES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'title', 'metaDesc'] as const
const SECTION_LABELS: Record<string, string> = {
  h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
  p: 'Para', li: 'List', blockquote: 'Quote', title: 'Title', metaDesc: 'Meta'
}
type SortKey = 'domain' | 'visibilityScore' | 'totalAppearances' | `pos${number}`

export function AIOPositionsView(): JSX.Element {
  const { domainMode, project } = useAppStore()
  const useSubdomain = domainMode === 'subdomain'

  const [activeTab, setActiveTab] = useState<'pivot' | 'by-position' | 'content-sources'>('pivot')
  const [sortKey, setSortKey] = useState<SortKey>('visibilityScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterDomain, setFilterDomain] = useState('')
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)

  // Both queries re-fetch automatically when domainMode changes (key includes it)
  const pivotQuery = useQuery({
    queryKey: ['aio', 'pivot', useSubdomain],
    queryFn: () => window.api.getAIODomainPivot(useSubdomain),
    enabled: !!project
  })

  const positionQuery = useQuery({
    queryKey: ['aio', 'positions', useSubdomain],
    queryFn: () => window.api.getAIOPositionReport(useSubdomain),
    enabled: !!project && activeTab === 'by-position'
  })

  const contentSourceQuery = useQuery({
    queryKey: ['aio', 'contentSources', useSubdomain],
    queryFn: () => window.api.getContentSourceReport(useSubdomain),
    enabled: !!project && activeTab === 'content-sources'
  })

  // Compute max value per position column for heat scaling
  const positionMaxes = useMemo(() => {
    const rows = pivotQuery.data ?? []
    const maxes: Record<number, number> = {}
    for (const pos of POSITIONS) {
      maxes[pos] = Math.max(...rows.map((r) => r[`pos${pos}` as keyof AIODomainPivotRow] as number), 1)
    }
    return maxes
  }, [pivotQuery.data])

  const maxVisibilityScore = useMemo(() => {
    const rows = pivotQuery.data ?? []
    return Math.max(...rows.map((r) => r.visibilityScore), 1)
  }, [pivotQuery.data])

  // Sort + filter pivot rows
  const pivotRows = useMemo(() => {
    let rows = [...(pivotQuery.data ?? [])]
    if (filterDomain) {
      rows = rows.filter((r) => r.domain.includes(filterDomain.toLowerCase()))
    }
    rows.sort((a, b) => {
      const av = a[sortKey as keyof AIODomainPivotRow] as number | string
      const bv = b[sortKey as keyof AIODomainPivotRow] as number | string
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return rows
  }, [pivotQuery.data, sortKey, sortDir, filterDomain])

  // Position-filtered rows for by-position tab
  const byPositionRows = useMemo(() => {
    let rows = positionQuery.data ?? []
    if (selectedPosition) rows = rows.filter((r) => r.position === selectedPosition)
    return rows
  }, [positionQuery.data, selectedPosition])

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  async function exportCSV(): Promise<void> {
    const table = activeTab === 'pivot' ? 'aio-pivot' : 'aio-positions'
    await window.api.exportCSV(table, useSubdomain)
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Open a project to view AIO positions.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-900">AIO Source Positions 1–10</h2>
          {/* Tab switcher */}
          <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
            <button
              onClick={() => setActiveTab('pivot')}
              className={`px-3 py-1 transition-colors ${activeTab === 'pivot' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Domain Heatmap
            </button>
            <button
              onClick={() => setActiveTab('by-position')}
              className={`px-3 py-1 transition-colors ${activeTab === 'by-position' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              By Position
            </button>
            <button
              onClick={() => setActiveTab('content-sources')}
              className={`px-3 py-1 transition-colors ${activeTab === 'content-sources' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Content Sources
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DomainModeToggle />
          <button
            onClick={exportCSV}
            className="px-3 py-1 text-xs bg-white hover:bg-gray-50 text-gray-600 rounded border border-gray-300 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
        <input
          type="text"
          placeholder="Filter domain..."
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-48"
        />
        {activeTab === 'by-position' && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Position:</span>
            {[null, ...POSITIONS].map((pos) => (
              <button
                key={pos ?? 'all'}
                onClick={() => setSelectedPosition(pos)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  selectedPosition === pos
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {pos ?? 'All'}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'pivot' && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-gray-400">Heat:</span>
            <span className="text-xs text-gray-400">Low</span>
            {[1,2,3,4,5,6,7,8,9].map((lvl) => (
              <span
                key={lvl}
                className={`inline-block w-4 h-4 rounded-sm border border-gray-200 heat-cell`}
                data-level={lvl}
              />
            ))}
            <span className="text-xs text-gray-400">High</span>
            <span className="text-xs text-gray-400 ml-3">
              Score = Σ(11 − position), max 10 pts at P1
            </span>
          </div>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {pivotQuery.isLoading
            ? 'Loading...'
            : activeTab === 'content-sources'
            ? `${(contentSourceQuery.data ?? []).length.toLocaleString()} domains`
            : `${pivotRows.length.toLocaleString()} domains`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'pivot' ? (
          <PivotTable
            rows={pivotRows}
            positionMaxes={positionMaxes}
            maxVisibilityScore={maxVisibilityScore}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            isLoading={pivotQuery.isLoading}
          />
        ) : activeTab === 'by-position' ? (
          <ByPositionTable rows={byPositionRows} isLoading={positionQuery.isLoading} />
        ) : (
          <ContentSourcesTable
            rows={contentSourceQuery.data ?? []}
            isLoading={contentSourceQuery.isLoading}
            filterDomain={filterDomain}
          />
        )}
      </div>
    </div>
  )
}

// ─── Pivot / Heatmap Table ────────────────────────────────────────────────────

function PivotTable({
  rows,
  positionMaxes,
  maxVisibilityScore,
  sortKey,
  sortDir,
  onSort,
  isLoading
}: {
  rows: AIODomainPivotRow[]
  positionMaxes: Record<number, number>
  maxVisibilityScore: number
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  isLoading: boolean
}): JSX.Element {
  if (isLoading) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const SortIcon = ({ k }: { k: SortKey }): JSX.Element => (
    <span className="ml-1 opacity-40">
      {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )

  const ThSortable = ({
    k,
    children
  }: {
    k: SortKey
    children: React.ReactNode
  }): JSX.Element => (
    <th
      className="px-3 py-2 text-left text-xs text-gray-500 font-medium cursor-pointer hover:text-gray-800 select-none whitespace-nowrap sticky top-0 bg-gray-50 border-b border-gray-200"
      onClick={() => onSort(k)}
    >
      {children}
      <SortIcon k={k} />
    </th>
  )

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <ThSortable k="domain">Domain</ThSortable>
          {POSITIONS.map((p) => (
            <ThSortable key={p} k={`pos${p}` as SortKey}>
              P{p}
            </ThSortable>
          ))}
          <ThSortable k="totalAppearances">Total</ThSortable>
          <ThSortable k="visibilityScore">
            <span title="pos1=10pts, pos2=9pts, ..., pos10=1pt">Score ⓘ</span>
          </ThSortable>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.domain}
            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
          >
            <td className="px-3 py-1.5 text-xs text-gray-800 font-mono max-w-48 truncate">
              {row.domain}
            </td>
            {POSITIONS.map((p) => {
              const val = row[`pos${p}` as keyof AIODomainPivotRow] as number
              const level = heatLevel(val, positionMaxes[p])
              return (
                <td
                  key={p}
                  className="heat-cell px-2 py-1.5 w-12"
                  data-value={val}
                  data-level={level > 0 ? level : undefined}
                >
                  {val > 0 ? val : ''}
                </td>
              )
            })}
            <td className="px-3 py-1.5 text-xs text-gray-700 tabular-nums text-right">
              {formatNumber(row.totalAppearances)}
            </td>
            <td className="px-3 py-1.5 text-xs text-right">
              <div className="flex items-center justify-end gap-1.5">
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.round((row.visibilityScore / maxVisibilityScore) * 100)}%` }}
                  />
                </div>
                <span className="text-blue-600 font-semibold tabular-nums w-10 text-right">
                  {formatNumber(row.visibilityScore)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── By Position Table ────────────────────────────────────────────────────────

function ByPositionTable({
  rows,
  isLoading
}: {
  rows: AIOPositionRow[]
  isLoading: boolean
}): JSX.Element {
  if (isLoading) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  let lastPosition = -1

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
            Pos
          </th>
          <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
            Domain
          </th>
          <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
            Appearances
          </th>
          <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
            Unique KWs
          </th>
          <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200">
            Share %
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const showPositionBoundary = row.position !== lastPosition
          lastPosition = row.position
          return (
            <tr
              key={`${row.position}-${row.domain}`}
              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${showPositionBoundary && i > 0 ? 'border-t-2 border-t-gray-300' : ''}`}
            >
              <td className="px-3 py-1.5 text-xs tabular-nums">
                {showPositionBoundary ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">
                    {row.position}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-1.5 text-xs text-gray-800 font-mono">{row.domain}</td>
              <td className="px-3 py-1.5 text-xs text-gray-700 tabular-nums text-right">
                {formatNumber(row.appearances)}
              </td>
              <td className="px-3 py-1.5 text-xs text-gray-700 tabular-nums text-right">
                {formatNumber(row.uniqueKeywords)}
              </td>
              <td className="px-3 py-1.5 text-xs text-blue-600 tabular-nums text-right font-semibold">
                {formatPct(row.sharePct)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Content Sources Table ────────────────────────────────────────────────────

function ContentSourcesTable({
  rows,
  isLoading,
  filterDomain
}: {
  rows: ContentSourceRow[]
  isLoading: boolean
  filterDomain: string
}): JSX.Element {
  if (isLoading) return <LoadingState />

  const filtered = filterDomain
    ? rows.filter((r) => r.domain.includes(filterDomain.toLowerCase()))
    : rows

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
        <span>No content source data yet.</span>
        <span>Run the crawler first to match AIO snippets to page elements.</span>
      </div>
    )
  }

  // Memoized so they don't recompute on every keystroke in the filter input
  const { totals, grandTotal, colMaxes } = useMemo(() => {
    const totals: Record<string, number> = {}
    let grandTotal = 0
    for (const st of SECTION_TYPES) {
      totals[st] = rows.reduce((s, r) => s + (r[st as keyof ContentSourceRow] as number), 0)
      grandTotal += totals[st]
    }
    const colMaxes: Record<string, number> = {}
    for (const st of SECTION_TYPES) {
      colMaxes[st] = Math.max(...rows.map((r) => r[st as keyof ContentSourceRow] as number), 1)
    }
    return { totals, grandTotal, colMaxes }
  }, [rows])

  return (
    <div>
      {/* Overall summary bar */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 font-medium mb-2">
          Overall: where do AI overview snippets come from? ({grandTotal.toLocaleString()} total matches)
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTION_TYPES.filter((st) => totals[st] > 0)
            .sort((a, b) => totals[b] - totals[a])
            .map((st) => {
              const pct = grandTotal > 0 ? ((totals[st] / grandTotal) * 100).toFixed(1) : '0'
              return (
                <div
                  key={st}
                  className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-xs"
                >
                  <span className="font-medium text-gray-700">{SECTION_LABELS[st]}</span>
                  <span className="text-blue-600 font-semibold tabular-nums">{pct}%</span>
                  <span className="text-gray-400 tabular-nums">({totals[st].toLocaleString()})</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Per-domain table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200 whitespace-nowrap">
              Domain
            </th>
            {SECTION_TYPES.map((st) => (
              <th
                key={st}
                className="px-2 py-2 text-center text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200 whitespace-nowrap"
                title={st}
              >
                {SECTION_LABELS[st]}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200 whitespace-nowrap">
              Total
            </th>
            <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 border-b border-gray-200 whitespace-nowrap">
              Top Source
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, i) => {
            const topSt = SECTION_TYPES.reduce((a, b) =>
              (row[a as keyof ContentSourceRow] as number) >= (row[b as keyof ContentSourceRow] as number) ? a : b
            )
            return (
              <tr
                key={row.domain}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
              >
                <td className="px-3 py-1.5 text-xs text-gray-800 font-mono max-w-48 truncate">
                  {row.domain}
                </td>
                {SECTION_TYPES.map((st) => {
                  const val = row[st as keyof ContentSourceRow] as number
                  const level = heatLevel(val, colMaxes[st])
                  return (
                    <td
                      key={st}
                      className="heat-cell px-2 py-1.5 w-12 text-center"
                      data-value={val}
                      data-level={level > 0 ? level : undefined}
                    >
                      {val > 0 ? val : ''}
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-xs text-gray-700 tabular-nums text-right font-semibold">
                  {formatNumber(row.totalMatches)}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    {SECTION_LABELS[topSt]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LoadingState(): JSX.Element {
  return (
    <div className="flex items-center justify-center h-32 text-gray-400 text-xs">
      Loading...
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
      <span>No AIO data yet.</span>
      <span>Add keywords and run a harvest to see results.</span>
    </div>
  )
}
