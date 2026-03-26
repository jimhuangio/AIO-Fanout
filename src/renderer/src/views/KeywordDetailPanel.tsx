// Slide-in panel: shown when a keyword row is clicked in KeywordsView.
// Shows AIO sources (pos 1-10), PAA questions, child keywords, and raw JSON inspector.
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

interface Props {
  keywordId: number
  keyword: string
  onClose: () => void
}

type Tab = 'aio' | 'paa' | 'children' | 'raw'

export function KeywordDetailPanel({ keywordId, keyword, onClose }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('aio')

  const aioQuery = useQuery({
    queryKey: ['keyword', keywordId, 'aio'],
    queryFn: () => window.api.getKeywordAIOSources(keywordId),
    enabled: activeTab === 'aio'
  })

  const paaQuery = useQuery({
    queryKey: ['keyword', keywordId, 'paa'],
    queryFn: () => window.api.getKeywordPAAQuestions(keywordId),
    enabled: activeTab === 'paa'
  })

  const childrenQuery = useQuery({
    queryKey: ['keyword', keywordId, 'children'],
    queryFn: () => window.api.getKeywordChildren(keywordId),
    enabled: activeTab === 'children'
  })

  const rawQuery = useQuery({
    queryKey: ['keyword', keywordId, 'raw'],
    queryFn: () => window.api.getKeywordRawJson(keywordId, 'aio'),
    enabled: activeTab === 'raw'
  })

  const aioSources = aioQuery.data ?? []
  const paaQuestions = paaQuery.data ?? []
  const children = childrenQuery.data ?? []

  const aioOnly = aioSources.filter((s: any) => s.resultType === 'aio')

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-[480px] shrink-0">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex-1 min-w-0 pr-3">
          <div className="text-xs text-gray-400 mb-0.5">Keyword detail</div>
          <div className="text-sm font-mono text-gray-900 truncate" title={keyword}>
            {keyword}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-300 hover:text-gray-600 text-xl leading-none mt-0.5 shrink-0 transition-colors"
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 text-xs">
        {([
          ['aio', `AIO (${aioOnly.length})`],
          ['paa', `PAA (${paaQuestions.length})`],
          ['children', `Children (${children.length})`],
          ['raw', 'Raw JSON']
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'aio' && (
          <AIOTab aioOnly={aioOnly} loading={aioQuery.isLoading} />
        )}
        {activeTab === 'paa' && (
          <PAATab questions={paaQuestions} loading={paaQuery.isLoading} />
        )}
        {activeTab === 'children' && (
          <ChildrenTab children={children} loading={childrenQuery.isLoading} />
        )}
        {activeTab === 'raw' && (
          <RawTab
            raw={rawQuery.data ?? null}
            loading={rawQuery.isLoading}
          />
        )}
      </div>
    </div>
  )
}

// ─── AIO Tab ──────────────────────────────────────────────────────────────────

function AIOTab({ aioOnly, loading }: { aioOnly: any[]; loading: boolean }): JSX.Element {
  if (loading) return <Loading />
  if (aioOnly.length === 0) return <Empty msg="No AIO sources found for this keyword." />
  return (
    <div className="p-3">
      <SourceList title="AI Overview Sources" sources={aioOnly} />
    </div>
  )
}

function SourceList({ title, sources }: { title: string; sources: any[] }): JSX.Element {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </div>
      <div className="space-y-2">
        {sources.map((s: any) => (
          <div
            key={s.id}
            className="bg-gray-50 rounded p-2.5 border border-gray-200"
          >
            <div className="flex items-start gap-2 mb-1.5">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-600 text-white text-xs font-bold shrink-0 mt-0.5">
                {s.position}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-blue-600 font-semibold truncate">{s.domainRoot}</div>
                <div
                  className="text-xs text-gray-400 truncate"
                  title={s.url}
                >
                  {s.url}
                </div>
              </div>
            </div>
            {s.aioSnippet && (
              <div className="text-xs text-gray-500 italic leading-relaxed border-t border-gray-200 pt-1.5 mt-1.5 line-clamp-3">
                "{s.aioSnippet}"
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PAA Tab ──────────────────────────────────────────────────────────────────

function PAATab({ questions, loading }: { questions: any[]; loading: boolean }): JSX.Element {
  if (loading) return <Loading />
  if (questions.length === 0) return <Empty msg="No PAA questions found for this keyword." />

  return (
    <div className="p-3 space-y-2">
      {questions.map((q: any, i: number) => (
        <div key={q.id} className="bg-gray-50 rounded p-2.5 border border-gray-200">
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 tabular-nums shrink-0 mt-0.5 w-4">
              {i + 1}.
            </span>
            <div className="flex-1">
              <div className="text-xs text-gray-800 leading-relaxed font-medium">
                {q.question}
              </div>
              {q.aiAnswer && (
                <div className="text-xs text-gray-500 italic mt-1.5 leading-relaxed border-t border-gray-200 pt-1.5 line-clamp-4">
                  {q.aiAnswer}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Children Tab ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-400',
  queued: 'text-yellow-500',
  running: 'text-blue-500',
  done: 'text-green-600',
  error: 'text-red-500'
}

function ChildrenTab({ children, loading }: { children: any[]; loading: boolean }): JSX.Element {
  if (loading) return <Loading />
  if (children.length === 0) {
    return <Empty msg="No child keywords discovered from this keyword." />
  }

  return (
    <div className="p-3 space-y-1">
      <div className="text-xs text-gray-400 mb-2">{children.length} child keywords</div>
      {children.map((child: any) => (
        <div
          key={child.id}
          className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50"
        >
          <span className={`text-xs shrink-0 ${STATUS_COLORS[child.status] ?? 'text-gray-400'}`}>
            ●
          </span>
          <span className="text-xs text-gray-800 font-mono flex-1 truncate">
            {child.keyword}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{child.source}</span>
          {child.aioSourceCount > 0 && (
            <span className="text-xs text-blue-600 tabular-nums shrink-0">
              {child.aioSourceCount} src
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Raw JSON Tab ─────────────────────────────────────────────────────────────

function RawTab({ raw, loading }: { raw: string | null; loading: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false)

  function copy(): void {
    if (!raw) return
    navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const pretty = useMemo(() => {
    if (!raw) return ''
    try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
  }, [raw])

  return (
    <div className="flex flex-col h-full">
      {raw && (
        <div className="flex items-center px-3 py-2 border-b border-gray-200 shrink-0">
          <button
            onClick={copy}
            className="ml-auto px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-200 transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-3">
        {loading && <Loading />}
        {!loading && !raw && <Empty msg="No SERP data stored for this keyword." />}
        {!loading && raw && (
          <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-all">
            {pretty}
          </pre>
        )}
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Loading(): JSX.Element {
  return <div className="flex justify-center p-6 text-gray-400 text-xs">Loading…</div>
}

function Empty({ msg }: { msg: string }): JSX.Element {
  return <div className="flex justify-center p-6 text-gray-400 text-xs">{msg}</div>
}
