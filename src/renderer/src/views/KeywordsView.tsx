import React, { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import { KeywordDetailPanel } from './KeywordDetailPanel'
import type { KeywordRow } from '../../../types'

function SortIcon({ sortKey, col, sortDir }: { sortKey: string | null; col: string; sortDir: 'asc' | 'desc' }): JSX.Element {
  if (sortKey !== col) return <span className="ml-1 text-gray-300">↕</span>
  return <span className="ml-1 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

const INTENT_COLORS: Record<string, string> = {
  informational:  'bg-blue-50 text-blue-700',
  commercial:     'bg-yellow-50 text-yellow-700',
  transactional:  'bg-green-50 text-green-700',
  navigational:   'bg-gray-100 text-gray-600'
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-400',
  queued: 'text-yellow-600',
  running: 'text-blue-600',
  done: 'text-green-600',
  error: 'text-red-500'
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Error'
}

export function KeywordsView(): JSX.Element {
  const { project, runStatus, enrichProgress } = useAppStore()
  const enriching = enrichProgress !== null
  const queryClient = useQueryClient()
  const [pasteText, setPasteText] = useState('')
  const [inserting, setInserting] = useState(false)
  const [insertResult, setInsertResult] = useState<{ inserted: number; total: number } | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterText, setFilterText] = useState('')
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [organicDomains, setOrganicDomains] = useState<string[]>([])
  const [domainInput, setDomainInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const domainRef = useRef<HTMLDivElement>(null)
  const [selectedKw, setSelectedKw] = useState<{ id: number; keyword: string } | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterIntent, setFilterIntent] = useState<string>('all')
  const [filterVolMin, setFilterVolMin] = useState('')
  const [filterFeatured, setFilterFeatured] = useState<'off' | 'fs' | 'fs-no-aio'>('off')
  const [snippetQuery, setSnippetQuery] = useState('')
  const [snippetQueryDebounced, setSnippetQueryDebounced] = useState('')

  // Debounce snippet search input by 400ms
  useEffect(() => {
    const t = setTimeout(() => setSnippetQueryDebounced(snippetQuery.trim()), 400)
    return () => clearTimeout(t)
  }, [snippetQuery])

  const { data: keywords = [], isLoading } = useQuery({
    queryKey: ['keywords', 'rows'],
    queryFn: () => window.api.getKeywordRows(2000, 0),
    enabled: !!project,
    staleTime: 2000,
    refetchInterval: runStatus === 'running' ? 3000 : false
  })

  // Live suggestions as user types
  const { data: suggestions = [] } = useQuery({
    queryKey: ['keywords', 'domainSuggestions', domainInput],
    queryFn: () => window.api.getDomainSuggestions(domainInput),
    enabled: !!project && domainInput.length >= 2
  })

  // One position query per selected domain
  const domainPositionResults = useQueries({
    queries: selectedDomains.map((domain) => ({
      queryKey: ['keywords', 'domainPositions', domain],
      queryFn: () => window.api.getDomainPositions(domain),
      enabled: !!project
    }))
  })

  // One organic position query per domain with organic toggle enabled
  const organicPositionResults = useQueries({
    queries: organicDomains.map((domain) => ({
      queryKey: ['keywords', 'organicPositions', domain],
      queryFn: () => window.api.getOrganicPositionsForDomain(domain),
      enabled: !!project
    }))
  })

  // Snippet search — fires when debounced query changes
  const { data: snippetMatchRows = [] } = useQuery({
    queryKey: ['keywords', 'snippetSearch', snippetQueryDebounced],
    queryFn: () => window.api.snippetSearch(snippetQueryDebounced),
    enabled: !!project && snippetQueryDebounced.length >= 2
  })

  // Featured snippet detection
  const { data: featuredSnippetRows = [] } = useQuery({
    queryKey: ['keywords', 'featuredSnippets'],
    queryFn: () => window.api.getFeaturedSnippetIds(),
    enabled: !!project,
    staleTime: 60_000
  })

  const featuredSnippetMap = useMemo(() => {
    const map = new Map<number, string>()
    featuredSnippetRows.forEach(r => map.set(r.keywordId, r.snippetType))
    return map
  }, [featuredSnippetRows])

  // Map: keywordId -> first matching snippet text
  const snippetMatchMap = useMemo(() => {
    const map = new Map<number, string>()
    snippetMatchRows.forEach(r => map.set(r.keywordId, r.snippet))
    return map
  }, [snippetMatchRows])

  // Stable key derived from data update timestamps — prevents re-running when the
  // useQueries array reference changes but no data has actually updated.
  const domainDataKey = domainPositionResults.map(r => r.dataUpdatedAt ?? 0).join(',')

  // Build map: domain -> keywordId -> best position
  const domainPositionMaps = useMemo(() => {
    const maps: Record<string, Record<number, number>> = {}
    selectedDomains.forEach((domain, i) => {
      const data = domainPositionResults[i]?.data ?? []
      const map: Record<number, number> = {}
      data.forEach(({ keywordId, position }) => { map[keywordId] = position })
      maps[domain] = map
    })
    return maps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomains, domainDataKey])

  const organicDataKey = organicPositionResults.map(r => r.dataUpdatedAt ?? 0).join(',')
  const organicPositionMaps = useMemo(() => {
    const maps: Record<string, Record<number, number>> = {}
    organicDomains.forEach((domain, i) => {
      const data = organicPositionResults[i]?.data ?? []
      const map: Record<number, number> = {}
      data.forEach(({ keywordId, position }) => { map[keywordId] = position })
      maps[domain] = map
    })
    return maps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organicDomains, organicDataKey])

  const filtered = useMemo(() => {
    const volMin = filterVolMin !== '' ? parseInt(filterVolMin, 10) : null
    const rows = keywords.filter((k) => {
      if (filterStatus !== 'all' && k.status !== filterStatus) return false
      if (filterText && !k.keyword.toLowerCase().includes(filterText.toLowerCase())) return false
      if (filterIntent !== 'all' && (k.searchIntent ?? '').toLowerCase() !== filterIntent) return false
      if (volMin !== null && !isNaN(volMin) && (k.searchVolume == null || k.searchVolume < volMin)) return false
      if (filterFeatured === 'fs' && !featuredSnippetMap.has(k.id)) return false
      if (filterFeatured === 'fs-no-aio' && (!featuredSnippetMap.has(k.id) || k.aioSourceCount > 0)) return false
      return true
    })

    if (!sortKey) return rows

    return [...rows].sort((a, b) => {
      let valA: string | number
      let valB: string | number

      if (sortKey === 'keyword') {
        valA = a.keyword.toLowerCase()
        valB = b.keyword.toLowerCase()
      } else if (sortKey === 'status') {
        valA = a.status
        valB = b.status
      } else if (sortKey === 'depth') {
        valA = a.depth
        valB = b.depth
      } else if (sortKey === 'aio') {
        valA = a.aioSourceCount
        valB = b.aioSourceCount
      } else if (sortKey === 'volume') {
        valA = a.searchVolume ?? -1
        valB = b.searchVolume ?? -1
      } else if (sortKey === 'intent') {
        valA = a.searchIntent ?? ''
        valB = b.searchIntent ?? ''
      } else if (sortKey.startsWith('organic_')) {
        const domain = sortKey.slice('organic_'.length)
        valA = organicPositionMaps[domain]?.[a.id] ?? Infinity
        valB = organicPositionMaps[domain]?.[b.id] ?? Infinity
      } else {
        // AIO domain column — lower position is better; missing = treat as 99
        valA = domainPositionMaps[sortKey]?.[a.id] ?? 99
        valB = domainPositionMaps[sortKey]?.[b.id] ?? 99
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [keywords, filterStatus, filterText, filterIntent, filterVolMin, filterFeatured, featuredSnippetMap, sortKey, sortDir, domainPositionMaps, organicPositionMaps])

  function handleSort(key: string): void {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function addDomain(domain: string): void {
    if (!selectedDomains.includes(domain)) {
      setSelectedDomains((prev) => [...prev, domain])
    }
    setDomainInput('')
    setShowSuggestions(false)
  }

  function removeDomain(domain: string): void {
    setSelectedDomains(prev => prev.filter(d => d !== domain))
    setOrganicDomains(prev => prev.filter(d => d !== domain))
  }

  function toggleOrganicDomain(domain: string): void {
    setOrganicDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }

  async function handleInsert(): Promise<void> {
    if (!pasteText.trim()) return
    setInserting(true)
    try {
      const result = await window.api.insertKeywords(pasteText)
      setInsertResult(result)
      setPasteText('')
      queryClient.invalidateQueries({ queryKey: ['keywords'] })
      setTimeout(() => setInsertResult(null), 4000)
    } finally {
      setInserting(false)
    }
  }

  async function handleCSVUpload(): Promise<void> {
    const result = await window.api.uploadKeywordsCSV()
    if (result) {
      setInsertResult(result)
      queryClient.invalidateQueries({ queryKey: ['keywords'] })
      setTimeout(() => setInsertResult(null), 4000)
    }
  }


  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-xs">
        Open a project first.
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Left: keyword list */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Input panel */}
        <div className="p-4 border-b border-gray-200 shrink-0 bg-white">
          <div className="flex gap-3">
            <div className="flex-1">
              <textarea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste keywords — one per line or comma-separated…"
                className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none font-mono"
              />
            </div>
            <div className="flex flex-col gap-2 justify-start">
              <button
                onClick={handleInsert}
                disabled={inserting || !pasteText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs rounded transition-colors whitespace-nowrap"
              >
                {inserting ? 'Adding…' : 'Add Keywords'}
              </button>
              <button
                onClick={handleCSVUpload}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded border border-gray-300 transition-colors whitespace-nowrap"
              >
                Import CSV
              </button>
              <button
                onClick={async () => {
                  await window.api.exportKeywordsCSV(selectedDomains)
                }}
                disabled={selectedDomains.length === 0}
                className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Export CSV
              </button>
              {insertResult && (
                <span className="text-xs text-green-600 text-center">
                  +{insertResult.inserted} new
                  {insertResult.total > insertResult.inserted
                    ? ` (${insertResult.total - insertResult.inserted} skip)`
                    : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
          {/* Keyword text filter */}
          <input
            type="text"
            placeholder="Keyword contains…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
          />

          {/* AIO snippet search */}
          <div className="relative">
            <input
              type="text"
              placeholder="AIO snippet contains…"
              value={snippetQuery}
              onChange={(e) => setSnippetQuery(e.target.value)}
              className={`px-2 py-1 text-xs bg-white border rounded text-gray-900 placeholder-gray-400 focus:outline-none w-48
                ${snippetQueryDebounced.length >= 2 && snippetMatchMap.size > 0
                  ? 'border-amber-400 focus:border-amber-500'
                  : 'border-gray-300 focus:border-blue-500'
                }`}
            />
            {snippetQueryDebounced.length >= 2 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 font-medium">
                {snippetMatchMap.size > 0 ? `${snippetMatchMap.size} kw` : '0'}
              </span>
            )}
          </div>

          {/* Intent filter */}
          <select
            value={filterIntent}
            onChange={(e) => setFilterIntent(e.target.value)}
            className="px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All intents</option>
            <option value="informational">Informational</option>
            <option value="commercial">Commercial</option>
            <option value="transactional">Transactional</option>
            <option value="navigational">Navigational</option>
          </select>

          {/* Volume min filter */}
          <div className="relative">
            <input
              type="number"
              min="0"
              placeholder="Min volume…"
              value={filterVolMin}
              onChange={(e) => setFilterVolMin(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-32"
            />
          </div>

          {/* Featured snippet filter */}
          <div className="flex items-center rounded border border-gray-200 overflow-hidden text-xs">
            {([
              ['off',       'All'],
              ['fs',        'Featured Snippet'],
              ['fs-no-aio', 'FS · No AIO'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterFeatured(val)}
                className={`px-2.5 py-1 transition-colors whitespace-nowrap
                  ${filterFeatured === val
                    ? val === 'fs-no-aio'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Domain column adder with autocomplete */}
          <div className="relative" ref={domainRef}>
            <input
              type="text"
              placeholder="Add domain column…"
              value={domainInput}
              onChange={(e) => { setDomainInput(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && suggestions.length > 0) addDomain(suggestions[0])
              }}
              className="px-2 py-1 text-xs bg-white border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44"
            />

            {/* Suggestions dropdown */}
            {showSuggestions && domainInput.length >= 2 && suggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-full">
                {suggestions
                  .filter((d) => !selectedDomains.includes(d))
                  .map((domain) => (
                    <button
                      key={domain}
                      onMouseDown={() => addDomain(domain)}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 font-mono transition-colors"
                    >
                      {domain}
                    </button>
                  ))}
              </div>
            )}

            {showSuggestions && domainInput.length >= 2 && suggestions.filter((d) => !selectedDomains.includes(d)).length === 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                {suggestions.length > 0 ? 'All matching domains already added' : `No domains match "${domainInput}"`}
              </div>
            )}
          </div>

          {/* Active domain chips */}
          {selectedDomains.map((domain) => {
            const hasOrganic = organicDomains.includes(domain)
            return (
              <span
                key={domain}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 font-mono"
              >
                {domain}
                <button
                  onClick={() => toggleOrganicDomain(domain)}
                  title={hasOrganic ? 'Hide organic rank column' : 'Show organic rank column'}
                  className={`transition-colors ml-0.5 px-0.5 rounded ${
                    hasOrganic
                      ? 'text-white bg-green-600 hover:bg-green-700'
                      : 'text-blue-300 hover:text-blue-600'
                  }`}
                >
                  #
                </button>
                <button
                  onClick={() => removeDomain(domain)}
                  className="text-blue-400 hover:text-blue-700 transition-colors"
                >
                  ✕
                </button>
              </span>
            )
          })}

          {/* Status pills */}
          <div className="flex items-center gap-1 ml-auto">
            {['all', 'pending', 'queued', 'running', 'done', 'error'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  filterStatus === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-400 tabular-nums">
            {filtered.length.toLocaleString()} keywords
          </span>

        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center h-16 text-gray-400 text-xs">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-gray-400 text-xs">
              No keywords yet — paste some above.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {([
                    { key: 'keyword', label: 'Keyword',             align: 'left'  },
                    { key: 'status',  label: 'Status',              align: 'left'  },
                    { key: 'depth',   label: 'AIO Depth',           align: 'left'  },
                    { key: 'aio',     label: 'AIO Count',           align: 'right' },
                    { key: 'volume',  label: 'Est. Monthly Volume', align: 'right', enriching: true },
                    { key: 'intent',  label: 'Intent',              align: 'left',  enriching: true },
                  ] as const).map(({ key, label, align, ...rest }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className={`px-3 py-2 text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap text-${align}`}
                    >
                      {label}
                      {'enriching' in rest && enriching && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-amber-500 animate-pulse">
                          ↻
                        </span>
                      )}
                      <SortIcon sortKey={sortKey} col={key} sortDir={sortDir} />
                    </th>
                  ))}
                  {selectedDomains.map((domain) => (
                    <React.Fragment key={domain}>
                      <th
                        onClick={() => handleSort(domain)}
                        className="px-3 py-2 text-right text-xs text-gray-500 font-medium sticky top-0 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap font-mono"
                      >
                        {domain}<SortIcon sortKey={sortKey} col={domain} sortDir={sortDir} />
                      </th>
                      {organicDomains.includes(domain) && (
                        <th
                          onClick={() => handleSort(`organic_${domain}`)}
                          className="px-3 py-2 text-right text-xs font-medium text-green-700 sticky top-0 bg-gray-50 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap font-mono"
                        >
                          <span className="flex items-center justify-end gap-1">
                            {domain} <span className="text-green-500">#</span>
                            <SortIcon sortKey={sortKey} col={`organic_${domain}`} sortDir={sortDir} />
                          </span>
                        </th>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw: KeywordRow, i) => {
                  const isSelected = selectedKw?.id === kw.id
                  const matchedSnippet = snippetMatchMap.get(kw.id)
                  const isSnippetMatch = !!matchedSnippet
                  const featuredType = featuredSnippetMap.get(kw.id)
                  return (
                    <tr
                      key={kw.id}
                      onClick={() =>
                        setSelectedKw(isSelected ? null : { id: kw.id, keyword: kw.keyword })
                      }
                      className={`border-b cursor-pointer transition-colors
                        ${isSnippetMatch
                          ? isSelected
                            ? 'border-amber-200 bg-amber-100'
                            : 'border-amber-100 bg-amber-50 hover:bg-amber-100'
                          : isSelected
                            ? 'border-gray-100 bg-blue-50'
                            : i % 2 === 0
                              ? 'border-gray-100 hover:bg-gray-50'
                              : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'
                        }
                      `}
                    >
                      <td className="px-3 py-1.5 text-xs text-gray-800 font-mono max-w-xs">
                        {kw.parentId != null && (
                          <span className="text-gray-300 mr-1">
                            {'└'.repeat(Math.min(kw.depth, 3))}
                          </span>
                        )}
                        {kw.keyword}
                        {featuredType && (
                          <span
                            className="ml-2 inline-block align-middle text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide bg-purple-100 text-purple-700 border border-purple-200"
                            title={featuredType === 'answer_box' ? 'Answer Box' : 'Featured Snippet'}
                          >
                            {featuredType === 'answer_box' ? 'AB' : 'FS'}
                          </span>
                        )}
                        {isSnippetMatch && (
                          <span
                            className="ml-2 inline-block max-w-[200px] truncate align-middle text-[10px] text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 cursor-default"
                            title={matchedSnippet}
                          >
                            {matchedSnippet}
                          </span>
                        )}
                        {kw.errorMsg && (
                          <span className="ml-2 text-red-500" title={kw.errorMsg}>
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-1.5 text-xs ${STATUS_COLORS[kw.status] ?? 'text-gray-500'}`}>
                        {STATUS_LABELS[kw.status] ?? kw.status}
                        {kw.status === 'running' && (
                          <span className="ml-1 animate-pulse">●</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-gray-400 tabular-nums">
                        {kw.depth}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right tabular-nums">
                        <span className={kw.aioSourceCount > 0 ? 'text-blue-600 font-semibold' : 'text-gray-300'}>
                          {kw.aioSourceCount > 0 ? kw.aioSourceCount : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-right tabular-nums">
                        {kw.searchVolume != null
                          ? <span className="text-gray-700">{kw.searchVolume.toLocaleString()}</span>
                          : enriching && kw.status === 'done'
                            ? <span className="inline-block w-12 h-3 bg-amber-100 rounded animate-pulse" />
                            : <span className="text-gray-200">—</span>
                        }
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {kw.searchIntent
                          ? <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${INTENT_COLORS[kw.searchIntent] ?? 'bg-gray-100 text-gray-600'}`}>
                              {kw.searchIntent}
                            </span>
                          : enriching && kw.status === 'done'
                            ? <span className="inline-block w-16 h-4 bg-amber-100 rounded animate-pulse" />
                            : <span className="text-gray-200">—</span>
                        }
                      </td>
                      {selectedDomains.map((domain) => {
                        const aioPos = domainPositionMaps[domain]?.[kw.id]
                        const orgPos = organicPositionMaps[domain]?.[kw.id]
                        return (
                          <React.Fragment key={domain}>
                            <td className="px-3 py-1.5 text-xs text-right tabular-nums">
                              {aioPos != null ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">
                                  {aioPos}
                                </span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                            {organicDomains.includes(domain) && (
                              <td className="px-3 py-1.5 text-xs text-right tabular-nums">
                                {orgPos != null ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-green-600 text-white text-xs font-bold">
                                    {orgPos}
                                  </span>
                                ) : null}
                              </td>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: detail panel (shown when a keyword is selected) */}
      {selectedKw && (
        <KeywordDetailPanel
          keywordId={selectedKw.id}
          keyword={selectedKw.keyword}
          onClose={() => setSelectedKw(null)}
        />
      )}
    </div>
  )
}
