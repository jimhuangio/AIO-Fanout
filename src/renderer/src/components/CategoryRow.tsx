import React, { useState } from 'react'
import type { MainCategoryRow as MainCategoryRowData } from '../../../types'
import { SubCategoryRow } from './SubCategoryRow'

interface Props {
  category: MainCategoryRowData
  expandedSubs: Set<number>
  onToggleSub: (subId: number) => void
  onToggleAll: (mainCategoryId: number, expand: boolean) => void
  onBrief: (id: number) => void  // positive = topic, negative = sub-cat, -(id+100000) = main cat
  onReportMain: (mainCategoryId: number) => void
  onReportSub: (subCategoryId: number) => void
  onRenameMain: (id: number, currentLabel: string, x: number, y: number) => void
  onRenameSub: (id: number, currentLabel: string, x: number, y: number) => void
  onRenameTopic: (id: number, currentLabel: string, x: number, y: number) => void
  onTopicDragStart: (e: React.DragEvent, topicId: number) => void
  onTopicContextMenu: (e: React.MouseEvent, topicId: number, topicLabel: string, parentMainCategoryId: number) => void
  onSubContextMenu: (e: React.MouseEvent, subId: number, label: string) => void
  onMainContextMenu: (e: React.MouseEvent, mainId: number, label: string) => void
  onSubDragStart: (e: React.DragEvent, subCategoryId: number) => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnSub: (e: React.DragEvent, targetSubCategoryId: number) => void
  onDropOnMain: (e: React.DragEvent, targetMainCategoryId: number) => void
}

export function CategoryRow({
  category, expandedSubs, onToggleSub, onToggleAll,
  onBrief, onReportMain, onReportSub,
  onRenameMain, onRenameSub, onRenameTopic,
  onTopicDragStart, onTopicContextMenu, onSubContextMenu, onMainContextMenu,
  onSubDragStart, onDragOver, onDropOnSub, onDropOnMain
}: Props): JSX.Element {
  const allExpanded = category.subCategories.every(sc => expandedSubs.has(sc.id))
  const [dragOver, setDragOver] = useState(false)

  return (
    <>
      {/* Main category header */}
      <tr
        onDragOver={e => { e.preventDefault(); setDragOver(true); onDragOver(e) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { setDragOver(false); onDropOnMain(e, category.id) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMainContextMenu(e, category.id, category.label) }}
        className={`border-b-2 border-blue-900 select-none ${dragOver ? 'opacity-80' : ''}`}
        style={{ background: '#1e3a5f' }}
      >
        <td className="pl-3 pr-3 py-2 text-sm font-bold text-white">
          <button
            onClick={() => onToggleAll(category.id, !allExpanded)}
            className="mr-2 text-xs text-blue-300"
          >
            {allExpanded ? '▼' : '▶'}
          </button>
          <button
            onClick={e => onRenameMain(category.id, category.label, e.clientX, e.clientY)}
            className="hover:underline"
          >
            {category.label}
          </button>
          <span className="ml-2 text-xs font-normal text-blue-300">
            {category.subCategories.length} sub-categories
          </span>
        </td>
        <td className="px-3 py-2 text-right text-sm text-blue-200 tabular-nums">
          {category.totalSearchVolume > 0
            ? category.totalSearchVolume.toLocaleString()
            : '—'}
        </td>
        <td className="px-3 py-2 text-right text-sm text-blue-200 tabular-nums">
          {category.subCategories.reduce((s, sc) => s + sc.topics.reduce((ss, t) => ss + t.memberCount, 0), 0)}
        </td>
        <td className="px-3 py-2 text-right text-xs text-blue-300">—</td>
        <td className="px-3 py-2 text-right text-xs text-blue-300">—</td>
        {/* Brief */}
        <td className="px-3 py-2 text-right">
          <button
            onClick={() => onBrief(-(category.id + 100000))}
            className="text-xs px-2 py-1 rounded text-white border border-white/30 hover:border-white/60"
          >
            Brief
          </button>
        </td>
        {/* Report */}
        <td className="px-3 py-2 text-right">
          <button
            onClick={() => onReportMain(category.id)}
            className="text-xs px-2 py-1 rounded text-white border border-white/30 hover:border-white/60"
          >
            Report
          </button>
        </td>
      </tr>

      {/* Sub-category rows */}
      {category.subCategories.map(sc => (
        <SubCategoryRow
          key={sc.id}
          subCategory={sc}
          isExpanded={expandedSubs.has(sc.id)}
          onToggle={() => onToggleSub(sc.id)}
          onBrief={onBrief}
          onReport={onReportSub}
          onRenameSub={onRenameSub}
          onRenameTopic={onRenameTopic}
          onTopicDragStart={onTopicDragStart}
          onTopicContextMenu={onTopicContextMenu}
          onSubContextMenu={onSubContextMenu}
          onDragStart={onSubDragStart}
          onDragOver={onDragOver}
          onDrop={onDropOnSub}
          parentMainCategoryId={category.id}
        />
      ))}
    </>
  )
}
