import React, { useState } from 'react'
import type { SubCategoryRow as SubCategoryRowData } from '../../../types'
import { TopicRow as TopicRowComp } from './TopicRow'

interface Props {
  subCategory: SubCategoryRowData
  isExpanded: boolean
  onToggle: () => void
  onBrief: (id: number) => void  // positive = topic id, negative = sub-cat id encoding (see handleBrief convention)
  onReport: (subCategoryId: number) => void
  onRenameSub: (id: number, currentLabel: string, x: number, y: number) => void
  onRenameTopic: (id: number, currentLabel: string, x: number, y: number) => void
  onTopicDragStart: (e: React.DragEvent, topicId: number) => void
  onTopicContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
  onSubContextMenu: (e: React.MouseEvent, subId: number, label: string) => void
  onDragStart: (e: React.DragEvent, subCategoryId: number) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, targetSubCategoryId: number) => void
  parentMainCategoryId: number
}

export function SubCategoryRow({
  subCategory, isExpanded, onToggle,
  onBrief, onReport, onRenameSub, onRenameTopic,
  onTopicDragStart, onTopicContextMenu, onSubContextMenu,
  onDragStart, onDragOver, onDrop,
  parentMainCategoryId
}: Props): JSX.Element {
  const [dragOver, setDragOver] = useState(false)

  return (
    <>
      {/* Sub-category header row */}
      <tr
        draggable
        onDragStart={e => onDragStart(e, subCategory.id)}
        onDragOver={e => { e.preventDefault(); setDragOver(true); onDragOver(e) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { setDragOver(false); onDrop(e, subCategory.id) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSubContextMenu(e, subCategory.id, subCategory.label) }}
        className={`border-b border-blue-200 cursor-pointer select-none ${dragOver ? 'bg-blue-100' : 'bg-blue-50'}`}
        onClick={onToggle}
      >
        <td className="pl-6 pr-3 py-1.5 text-sm font-semibold text-blue-800">
          <span className="mr-2 text-xs text-blue-400">{isExpanded ? '▼' : '▶'}</span>
          <button
            onClick={e => { e.stopPropagation(); onRenameSub(subCategory.id, subCategory.label, e.clientX, e.clientY) }}
            className="hover:underline"
          >
            {subCategory.label}
          </button>
          <span className="ml-2 text-xs font-normal text-blue-400">
            {subCategory.topics.length} topic{subCategory.topics.length !== 1 ? 's' : ''}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-blue-700 tabular-nums">
          {subCategory.totalSearchVolume > 0
            ? subCategory.totalSearchVolume.toLocaleString()
            : '—'}
        </td>
        <td className="px-3 py-1.5 text-right text-sm text-blue-700 tabular-nums">
          {subCategory.topics.reduce((s, t) => s + t.memberCount, 0)}
        </td>
        <td className="px-3 py-1.5 text-right text-xs text-gray-500 font-mono">
          {subCategory.topDomain ?? '—'}
        </td>
        <td className="px-3 py-1.5 text-right">
          {subCategory.bestDomainPosition != null
            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs font-bold">{subCategory.bestDomainPosition}</span>
            : <span className="text-gray-300 text-sm">—</span>}
        </td>
        {/* Brief */}
        <td className="px-3 py-1.5 text-right" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onBrief(-subCategory.id)}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Brief
          </button>
        </td>
        {/* Report */}
        <td className="px-3 py-1.5 text-right" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onReport(subCategory.id)}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Report
          </button>
        </td>
      </tr>

      {/* Topic rows */}
      {isExpanded && subCategory.topics.map(topic => (
        <TopicRowComp
          key={topic.id}
          topic={topic}
          onBrief={onBrief}
          onRename={onRenameTopic}
          onDragStart={onTopicDragStart}
          onContextMenu={onTopicContextMenu}
          parentMainCategoryId={parentMainCategoryId}
        />
      ))}
    </>
  )
}
