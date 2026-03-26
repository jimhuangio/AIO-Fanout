import React, { useState } from 'react'
import type { TopicRow as TopicRowData, TopicKeywordRow } from '../../../types'

interface Props {
  topic: TopicRowData
  onBrief: (topicId: number) => void
  onRename: (topicId: number, currentLabel: string, x: number, y: number) => void
  onDragStart: (e: React.DragEvent, topicId: number) => void
  onContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
  parentMainCategoryId: number
}

const INTENT_STYLES: Record<string, string> = {
  informational:  'bg-blue-100 text-blue-700',
  commercial:     'bg-green-100 text-green-700',
  transactional:  'bg-amber-100 text-amber-700',
  navigational:   'bg-purple-100 text-purple-700',
}

const INTENT_LABELS: Record<string, string> = {
  informational: 'Info',
  commercial:    'Comm.',
  transactional: 'Trans.',
  navigational:  'Nav.',
}

export function TopicRow({ topic, onBrief, onRename, onDragStart, onContextMenu, parentMainCategoryId }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [keywords, setKeywords] = useState<TopicKeywordRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleExpand(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (!expanded && keywords === null) {
      setLoading(true)
      try {
        const rows = await window.api.getTopicKeywords(topic.id)
        setKeywords(rows)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(prev => !prev)
  }

  return (
    <>
      <tr
        draggable
        onDragStart={e => onDragStart(e, topic.id)}
        onContextMenu={e => onContextMenu(e, topic.id, topic.label, parentMainCategoryId)}
        className={`border-b border-gray-100 cursor-grab active:cursor-grabbing ${expanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      >
        {/* Label + chips + expand button */}
        <td className="pl-10 pr-3 py-1.5 text-sm text-gray-800">
          <div className="flex items-start gap-2">
            <span className="text-gray-300 select-none mt-0.5">⠿</span>
            <button
              onClick={handleExpand}
              className={`mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center rounded text-[9px] border transition-colors
                ${expanded
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-blue-600 hover:border-blue-600 hover:text-white'
                }`}
            >
              {loading ? '…' : expanded ? '▼' : '▶'}
            </button>
            <div>
              <button
                onClick={e => onRename(topic.id, topic.label, e.clientX, e.clientY)}
                className="hover:underline text-left font-medium"
              >
                {topic.label}
              </button>
              {topic.topKeywords && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {topic.topKeywords.split('|').map((kw, i) => (
                    <span key={i} className="text-xs text-gray-400">{kw}{i < topic.topKeywords!.split('|').length - 1 ? ' ·' : ''}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
          {topic.totalSearchVolume != null ? topic.totalSearchVolume.toLocaleString() : '—'}
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-gray-500 tabular-nums">
          {topic.memberCount}
        </td>
        <td className="px-3 py-1.5 text-right text-xs text-gray-500 font-mono">
          {topic.topDomain ?? '—'}
        </td>
        <td className="px-3 py-1.5 text-right">
          {topic.bestDomainPosition != null
            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">{topic.bestDomainPosition}</span>
            : <span className="text-gray-300 text-sm">—</span>}
        </td>
        <td className="px-3 py-1.5 text-right">
          <button
            onClick={() => onBrief(topic.id)}
            className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
          >
            Brief
          </button>
        </td>
        <td className="px-3 py-1.5" />
      </tr>

      {/* Expanded keyword list */}
      {expanded && (
        <tr className="border-b border-blue-200 bg-blue-50">
          <td colSpan={7} className="px-0 py-0">
            <div className="pl-16 pr-4 pb-3 pt-1">
              <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_80px_64px_80px_80px] px-3 py-1 bg-blue-100 border-b border-blue-200">
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Keyword</span>
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide text-right">Volume/mo</span>
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide text-right">Intent</span>
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide text-right">Depth</span>
                  <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide text-right">AIO Count</span>
                </div>

                {keywords === null || keywords.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No keywords found.</div>
                ) : keywords.map(kw => {
                  const intentKey = kw.searchIntent?.toLowerCase() ?? ''
                  return (
                    <div
                      key={kw.id}
                      className="grid grid-cols-[1fr_80px_64px_80px_80px] px-3 py-1.5 border-b border-gray-100 last:border-0 hover:bg-blue-50 items-center"
                    >
                      <span className="text-xs text-gray-700 font-mono truncate pr-2">{kw.keyword}</span>
                      <span className="text-xs text-gray-500 tabular-nums text-right">
                        {kw.searchVolume != null ? kw.searchVolume.toLocaleString() : '—'}
                      </span>
                      <span className="text-right">
                        {intentKey && INTENT_STYLES[intentKey] ? (
                          <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${INTENT_STYLES[intentKey]}`}>
                            {INTENT_LABELS[intentKey] ?? intentKey}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 text-right">
                        {kw.depth === 0 ? 'Root' : `L${kw.depth}`}
                      </span>
                      <span className="text-right">
                        {kw.aioSourceCount > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded bg-blue-600 text-white text-[11px] font-bold">
                            {kw.aioSourceCount}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
