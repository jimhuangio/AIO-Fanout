import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { JobCounts } from '../../../types'

export function JobStatusBar(): JSX.Element {
  const { jobCounts, setJobCounts, runStatus, setRunStatus, enrichProgress, setEnrichProgress } = useAppStore()
  const queryClient = useQueryClient()
  const [runError, setRunError] = useState<string>('')

  // Subscribe to progress events from main process
  useEffect(() => {
    const unsub = window.api.onRunProgress((counts: JobCounts) => {
      setJobCounts(counts)
    })
    return unsub
  }, [setJobCounts])

  // Reset button state and refresh data when scheduler self-completes
  useEffect(() => {
    const unsub = window.api.onRunComplete(() => {
      setRunStatus('idle')
      setEnrichProgress(null)
      queryClient.invalidateQueries({ queryKey: ['keywords'] })
    })
    return unsub
  }, [setRunStatus, queryClient])

  // Enrichment progress — refresh keyword rows on each batch so volume/intent appear live
  useEffect(() => {
    const unsub = window.api.onEnrichProgress((data) => {
      setEnrichProgress(data)
      queryClient.invalidateQueries({ queryKey: ['keywords', 'rows'] })
    })
    return unsub
  }, [queryClient])

  const total = Object.values(jobCounts).reduce((a, b) => a + b, 0)
  const progress = total > 0 ? Math.round((jobCounts.done / total) * 100) : 0

  async function handleStart(): Promise<void> {
    setRunError('')
    try {
      await window.api.startRun()
      setRunStatus('running')
    } catch (err) {
      setRunError(String(err).replace('Error: ', ''))
    }
  }

  async function handlePause(): Promise<void> {
    await window.api.pauseRun()
    setRunStatus('paused')
  }

  async function handleResume(): Promise<void> {
    await window.api.resumeRun()
    setRunStatus('running')
  }

  async function handleStop(): Promise<void> {
    await window.api.stopRun()
    setRunStatus('idle')
  }

  async function handleReenrich(): Promise<void> {
    setRunError('')
    setEnrichProgress({ done: 0, total: 1 })
    try {
      await window.api.runEnrichment()
    } catch (err) {
      setRunError(String(err).replace('Error: ', ''))
    } finally {
      setEnrichProgress(null)
      queryClient.invalidateQueries({ queryKey: ['keywords'] })
    }
  }

  const enrichPct = enrichProgress
    ? Math.round((enrichProgress.done / enrichProgress.total) * 100)
    : 0

  return (
    <div className="flex flex-col bg-gray-50 border-b border-gray-200">
      {/* Main run row */}
      <div className="flex items-center gap-4 px-4 py-2">
        {/* Run controls */}
        <div className="flex items-center gap-2">
          {runStatus === 'idle' && (
            <>
              <button
                onClick={handleStart}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
              >
                ▶ Start Run
              </button>
              <button
                onClick={handleReenrich}
                disabled={enrichProgress !== null}
                className="px-3 py-1 bg-white hover:bg-gray-100 disabled:opacity-40 text-gray-600 text-xs rounded border border-gray-300 transition-colors"
                title="Re-fetch volume & intent for all unenriched keywords"
              >
                ↻ Re-enrich
              </button>
            </>
          )}
          {runStatus === 'running' && (
            <>
              <button
                onClick={handlePause}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded transition-colors"
              >
                ⏸ Pause
              </button>
              <button
                onClick={handleStop}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
              >
                ■ Stop
              </button>
            </>
          )}
          {runStatus === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
              >
                ▶ Resume
              </button>
              <button
                onClick={handleStop}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
              >
                ■ Stop
              </button>
            </>
          )}
        </div>

        {/* SERP progress bar */}
        {total > 0 && !enrichProgress && (
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-48">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{progress}%</span>
          </div>
        )}

        {/* Run error */}
        {runError && (
          <span className="text-xs text-red-500 truncate max-w-xs" title={runError}>{runError}</span>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-3 text-xs tabular-nums ml-auto">
          <Badge label="Pending" value={jobCounts.pending} color="gray" />
          <Badge label="Running" value={jobCounts.running} color="blue" />
          <Badge label="Done" value={jobCounts.done} color="green" />
          <Badge label="Error" value={jobCounts.error} color="red" />
        </div>
      </div>

      {/* Enrichment progress row — shown while volume/intent/categories are loading */}
      {enrichProgress && (
        <div className="flex items-center gap-3 px-4 py-1.5 border-t border-gray-200 bg-amber-50">
          <span className="text-xs text-amber-700 font-medium shrink-0">
            Fetching volume & intent…
          </span>
          <div className="flex-1 h-1.5 bg-amber-200 rounded-full overflow-hidden max-w-48">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${enrichPct}%` }}
            />
          </div>
          <span className="text-xs text-amber-600 tabular-nums shrink-0">
            {enrichProgress.done} / {enrichProgress.total}
          </span>
        </div>
      )}
    </div>
  )
}

function Badge({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: 'gray' | 'blue' | 'green' | 'red'
}): JSX.Element {
  const colorMap = {
    gray: 'text-gray-500',
    blue: 'text-blue-600',
    green: 'text-green-600',
    red: 'text-red-500'
  }
  return (
    <span className={`${colorMap[color]}`}>
      {label}: <strong>{value.toLocaleString()}</strong>
    </span>
  )
}
