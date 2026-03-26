import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { ContentBrief } from '../../../types'
import { CategoryRow } from '../components/CategoryRow'
import { TopicRow } from '../components/TopicRow'

export function TopicsView(): JSX.Element {
  const { project } = useAppStore()
  const queryClient = useQueryClient()
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')
  const [briefModal, setBriefModal] = useState<{ topicLabel: string; brief: ContentBrief } | null>(null)

  const { data: hierarchy, isLoading } = useQuery({
    queryKey: ['categories', 'hierarchy'],
    queryFn: () => window.api.getCategoryHierarchy(),
    enabled: !!project
  })

  // Auto-refresh when the scheduler re-clusters in the background
  useEffect(() => {
    return window.api.onTopicsUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ['topics'] })
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    })
  }, [queryClient])

  // ─── Collapse state ──────────────────────────────────────────────────────────

  const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set())

  function toggleSub(subId: number): void {
    setExpandedSubs(prev => {
      const next = new Set(prev)
      if (next.has(subId)) next.delete(subId)
      else next.add(subId)
      return next
    })
  }

  function toggleAllInMain(mainCategoryId: number, expand: boolean): void {
    const mc = hierarchy?.mainCategories.find(m => m.id === mainCategoryId)
    if (!mc) return
    setExpandedSubs(prev => {
      const next = new Set(prev)
      mc.subCategories.forEach(sc => expand ? next.add(sc.id) : next.delete(sc.id))
      return next
    })
  }

  // ─── Inline rename ───────────────────────────────────────────────────────────

  const [renameTarget, setRenameTarget] = useState<{
    type: 'main' | 'sub' | 'topic'
    id: number
    label: string
    x: number
    y: number
  } | null>(null)

  function startRename(type: 'main' | 'sub' | 'topic', id: number, currentLabel: string, x: number, y: number): void {
    setRenameTarget({ type, id, label: currentLabel, x, y })
  }

  async function saveRename(newLabel: string): Promise<void> {
    if (!renameTarget || !newLabel.trim()) { setRenameTarget(null); return }
    try {
      if (renameTarget.type === 'main') await window.api.renameMainCategory(renameTarget.id, newLabel)
      else if (renameTarget.type === 'sub') await window.api.renameSubCategory(renameTarget.id, newLabel)
      else await window.api.updateTopicLabel(renameTarget.id, newLabel)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
      queryClient.invalidateQueries({ queryKey: ['topics'] })
    } catch (err) {
      console.error('saveRename failed:', err)
    } finally {
      setRenameTarget(null)
    }
  }

  // ─── Drag and drop ───────────────────────────────────────────────────────────

  const dragRef = useRef<{ type: 'topic' | 'subcategory'; id: number } | null>(null)

  function handleTopicDragStart(e: React.DragEvent, topicId: number): void {
    dragRef.current = { type: 'topic', id: topicId }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSubDragStart(e: React.DragEvent, subCategoryId: number): void {
    dragRef.current = { type: 'subcategory', id: subCategoryId }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent): void {
    e.preventDefault()
  }

  async function handleDropOnSub(e: React.DragEvent, targetSubCategoryId: number): Promise<void> {
    e.preventDefault()
    const drag = dragRef.current
    if (!drag) return
    try {
      if (drag.type === 'topic') {
        // Guard: skip if already in the target sub-category
        const currentSubId = hierarchy?.mainCategories
          .flatMap(mc => mc.subCategories)
          .find(sc => sc.topics.some(t => t.id === drag.id))?.id
        if (currentSubId === targetSubCategoryId) return
        await window.api.updateTopicCategory(drag.id, targetSubCategoryId)
      }
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    } catch (err) {
      console.error('handleDropOnSub failed:', err)
    } finally {
      dragRef.current = null
    }
  }

  async function handleDropOnMain(e: React.DragEvent, targetMainCategoryId: number): Promise<void> {
    e.preventDefault()
    const drag = dragRef.current
    if (!drag || drag.type !== 'subcategory') return
    try {
      await window.api.moveSubCategory(drag.id, targetMainCategoryId)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    } catch (err) {
      console.error('handleDropOnMain failed:', err)
    } finally {
      dragRef.current = null
    }
  }

  // ─── Context menu ────────────────────────────────────────────────────────────

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number
    type: 'topic' | 'sub' | 'main'
    id: number
    label: string
    parentMainCategoryId?: number
  } | null>(null)

  function handleContextMenu(
    e: React.MouseEvent,
    type: 'topic' | 'sub' | 'main',
    id: number,
    label: string,
    parentMainCategoryId?: number
  ): void {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, type, id, label, parentMainCategoryId })
  }

  async function handleMoveTopicToSub(subCategoryId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'topic') return
    try {
      await window.api.updateTopicCategory(ctxMenu.id, subCategoryId)
      setCtxMenu(null)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    } catch (err) {
      console.error('handleMoveTopicToSub failed:', err)
    }
  }

  async function handleMoveTopicToNewSub(): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'topic' || !ctxMenu.parentMainCategoryId || ctxMenu.parentMainCategoryId < 0) return
    const { x, y, parentMainCategoryId, id: topicId } = ctxMenu
    try {
      setCtxMenu(null)
      const newSubId = await window.api.createSubCategory('New Sub-category', parentMainCategoryId)
      await window.api.updateTopicCategory(topicId, newSubId)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
      startRename('sub', newSubId, 'New Sub-category', x, y)
    } catch (err) {
      console.error('handleMoveTopicToNewSub failed:', err)
    }
  }

  async function handleMoveSubToMain(mainCategoryId: number): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'sub') return
    try {
      await window.api.moveSubCategory(ctxMenu.id, mainCategoryId)
      setCtxMenu(null)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
    } catch (err) {
      console.error('handleMoveSubToMain failed:', err)
    }
  }

  async function handleMoveSubToNewMain(): Promise<void> {
    if (!ctxMenu || ctxMenu.type !== 'sub') return
    const { x, y, id: subId } = ctxMenu
    try {
      setCtxMenu(null)
      const newMainId = await window.api.createMainCategory('New Category')
      await window.api.moveSubCategory(subId, newMainId)
      queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
      startRename('main', newMainId, 'New Category', x, y)
    } catch (err) {
      console.error('handleMoveSubToNewMain failed:', err)
    }
  }

  // Dismiss context menu on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Dismiss context menu on click-away
  useEffect(() => {
    if (!ctxMenu) return
    const onMouseDown = (): void => setCtxMenu(null)
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [ctxMenu])

  // ─── Brief handler ───────────────────────────────────────────────────────────

  // id convention: positive = topic, negative 1-99999 = -(subCategoryId), -(id+100000) = main cat
  async function handleBrief(id: number): Promise<void> {
    try {
      if (id >= 0) {
        const result = await window.api.generateTopicBrief(id)
        setBriefModal({ topicLabel: `Topic #${id}`, brief: result.brief })
      } else if (id > -100000) {
        const subCatId = -id
        const sc = hierarchy?.mainCategories.flatMap(mc => mc.subCategories).find(s => s.id === subCatId)
        if (!sc) return
        const topTopic = sc.topics[0]
        if (!topTopic) return
        const result = await window.api.generateTopicBrief(topTopic.id)
        setBriefModal({ topicLabel: sc.label, brief: result.brief })
      } else {
        const mainId = -(id + 100000)
        const mc = hierarchy?.mainCategories.find(m => m.id === mainId)
        if (!mc || mc.subCategories.length === 0) return
        const topTopic = mc.subCategories[0]?.topics[0]
        if (!topTopic) return
        const result = await window.api.generateTopicBrief(topTopic.id)
        setBriefModal({ topicLabel: mc.label, brief: result.brief })
      }
    } catch (err) {
      console.error('handleBrief failed:', err)
    }
  }

  // ─── Run clustering ──────────────────────────────────────────────────────────

  async function handleRun(): Promise<void> {
    setRunning(true)
    setRunMsg('')
    try {
      const result = await window.api.runTopicClustering()
      await queryClient.invalidateQueries({ queryKey: ['topics'] })
      await queryClient.invalidateQueries({ queryKey: ['categories', 'hierarchy'] })
      setRunMsg(`${result.count} clusters found`)
      setTimeout(() => setRunMsg(''), 4000)
    } finally {
      setRunning(false)
    }
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Open a project to view topic clusters.
      </div>
    )
  }

  const hasData = hierarchy && (hierarchy.mainCategories.length > 0 || hierarchy.uncategorised.length > 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Content Brief Modal */}
      {briefModal && (
        <BriefModal
          topicLabel={briefModal.topicLabel}
          brief={briefModal.brief}
          onClose={() => setBriefModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Topic Clusters</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Keywords grouped by semantic + domain overlap
          </p>
        </div>
        <div className="flex items-center gap-3">
          {runMsg && <span className="text-xs text-green-600">{runMsg}</span>}
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors font-medium"
          >
            {running ? 'Clustering...' : 'Run Clustering'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-xs">
            Loading...
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400 text-sm">
            <span className="text-2xl">No clusters yet.</span>
            <span className="text-xs text-gray-300">
              Run clustering after your keywords have finished processing.
            </span>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="pl-3 pr-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Topic / Category</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Est. Traffic/mo</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Keywords</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Most Shown</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Highest Rank</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Brief</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Report</th>
              </tr>
            </thead>
            <tbody>
              {hierarchy?.mainCategories.map(mc => (
                <CategoryRow
                  key={mc.id}
                  category={mc}
                  expandedSubs={expandedSubs}
                  onToggleSub={toggleSub}
                  onToggleAll={toggleAllInMain}
                  onBrief={handleBrief}
                  onReportMain={async (id) => { await window.api.generateReportForMain(id) }}
                  onReportSub={async (id) => { await window.api.generateReportForSub(id) }}
                  onRenameMain={(id, label, x, y) => startRename('main', id, label, x, y)}
                  onRenameSub={(id, label, x, y) => startRename('sub', id, label, x, y)}
                  onRenameTopic={(id, label, x, y) => startRename('topic', id, label, x, y)}
                  onTopicDragStart={handleTopicDragStart}
                  onTopicContextMenu={(e, id, label, parentMainId) => handleContextMenu(e, 'topic', id, label, parentMainId)}
                  onSubContextMenu={(e, id, label) => handleContextMenu(e, 'sub', id, label)}
                  onMainContextMenu={(e, id, label) => handleContextMenu(e, 'main', id, label)}
                  onSubDragStart={handleSubDragStart}
                  onDragOver={handleDragOver}
                  onDropOnSub={handleDropOnSub}
                  onDropOnMain={handleDropOnMain}
                />
              ))}

              {/* Uncategorised bucket */}
              {(hierarchy?.uncategorised.length ?? 0) > 0 && (
                <>
                  <tr className="border-b-2 border-gray-400" style={{ background: '#374151' }}>
                    <td colSpan={7} className="pl-3 py-2 text-sm font-bold text-white">
                      <button onClick={() => toggleSub(-1)} className="mr-2 text-xs text-gray-300">
                        {expandedSubs.has(-1) ? '\u25BC' : '\u25B6'}
                      </button>
                      Uncategorised
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {hierarchy?.uncategorised.length} topic{hierarchy?.uncategorised.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>
                  {expandedSubs.has(-1) && hierarchy?.uncategorised.map(topic => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      onBrief={handleBrief}
                      onRename={(id, label, x, y) => startRename('topic', id, label, x, y)}
                      onDragStart={handleTopicDragStart}
                      onContextMenu={(e, id, label) => handleContextMenu(e, 'topic', id, label, undefined)}
                      parentMainCategoryId={-1}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Context menu -- dismissed on click-away (document mousedown) or Escape */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 text-sm min-w-[180px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => { startRename(ctxMenu.type, ctxMenu.id, ctxMenu.label, ctxMenu.x, ctxMenu.y); setCtxMenu(null) }}
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
          >
            Rename
          </button>
          {ctxMenu.type === 'topic' && (
            <>
              <div className="px-3 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wide border-t mt-1 pt-1">Move to sub-category</div>
              {hierarchy?.mainCategories.flatMap(mc => mc.subCategories).map(sc => (
                <button
                  key={sc.id}
                  onClick={() => handleMoveTopicToSub(sc.id)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                >
                  {sc.label}
                </button>
              ))}
              <button
                onClick={handleMoveTopicToNewSub}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-blue-600"
              >
                + New sub-category...
              </button>
            </>
          )}
          {ctxMenu.type === 'sub' && (
            <>
              <div className="px-3 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wide border-t mt-1 pt-1">Move to main category</div>
              {hierarchy?.mainCategories.map(mc => (
                <button
                  key={mc.id}
                  onClick={() => handleMoveSubToMain(mc.id)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                >
                  {mc.label}
                </button>
              ))}
              <button
                onClick={handleMoveSubToNewMain}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-blue-600"
              >
                + New main category...
              </button>
            </>
          )}
        </div>
      )}

      {/* Inline rename overlay -- positioned near the clicked label */}
      {renameTarget && (
        <div className="fixed inset-0 z-40" onClick={() => setRenameTarget(null)}>
          <div
            className="absolute bg-white border border-blue-400 rounded shadow-lg p-2"
            style={{ left: renameTarget.x, top: renameTarget.y + 4 }}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              defaultValue={renameTarget.label}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
              onKeyDown={e => {
                if (e.key === 'Enter') saveRename((e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setRenameTarget(null)
              }}
            />
            <div className="text-xs text-gray-400 mt-1">Enter to save - Esc to cancel</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Content Brief Modal ──────────────────────────────────────────────────────

function BriefModal({
  topicLabel,
  brief,
  onClose
}: {
  topicLabel: string
  brief: ContentBrief
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Content Brief</div>
            <div className="text-sm font-semibold text-gray-900">{topicLabel}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-600 text-xl leading-none mt-0.5 transition-colors"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* H1 + Meta */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Recommended H1</div>
            <div className="text-base font-semibold text-gray-900">{brief.h1}</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetaCard label="Target Audience" value={brief.targetAudience} />
            <MetaCard label="Content Type" value={brief.contentType} />
            <MetaCard label="Word Count" value={brief.wordCount} />
          </div>

          {/* Key Topics */}
          {brief.keyTopics.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Key Topics to Cover</div>
              <ul className="space-y-1">
                {brief.keyTopics.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-blue-400 mt-0.5 shrink-0">&bull;</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Outline */}
          {brief.outline.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Content Outline</div>
              <div className="space-y-3">
                {brief.outline.map((section, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400 mr-2">H2</span>
                      <span className="text-sm font-medium text-gray-800">{section.heading}</span>
                    </div>
                    {section.keyPoints.length > 0 && (
                      <ul className="px-4 py-2.5 space-y-1">
                        {section.keyPoints.map((pt, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-gray-600">
                            <span className="text-gray-300 shrink-0 mt-0.5">&ndash;</span>
                            {pt}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xs text-gray-800 font-medium">{value}</div>
    </div>
  )
}
