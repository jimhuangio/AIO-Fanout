import { create } from 'zustand'
import type { ProjectMeta, JobCounts } from '../../../types'

// IMPORTANT: domainMode is NEVER passed to persist().
// It must reset to 'root' on every app start — this is a product requirement.

type DomainMode = 'root' | 'subdomain'
type RunStatus = 'idle' | 'running' | 'paused'

interface AppState {
  // Session-only — resets on restart
  domainMode: DomainMode
  setDomainMode: (m: DomainMode) => void

  // Project
  project: ProjectMeta | null
  setProject: (p: ProjectMeta | null) => void

  // Run state
  runStatus: RunStatus
  setRunStatus: (s: RunStatus) => void
  jobCounts: JobCounts
  setJobCounts: (c: JobCounts) => void
  enrichProgress: { done: number; total: number } | null
  setEnrichProgress: (p: { done: number; total: number } | null) => void

  // MCP connection
  mcpConnected: boolean
  setMcpConnected: (v: boolean) => void

  // Active view
  activeView: 'setup' | 'keywords' | 'positions' | 'topics' | 'crawler'
  setActiveView: (v: AppState['activeView']) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Domain toggle — always starts as 'root', never persisted
  domainMode: 'root',
  setDomainMode: (m) => set({ domainMode: m }),

  // Project
  project: null,
  setProject: (p) => set({ project: p }),

  // Run state
  runStatus: 'idle',
  setRunStatus: (s) => set({ runStatus: s }),
  jobCounts: { pending: 0, queued: 0, running: 0, done: 0, error: 0 },
  setJobCounts: (c) => set({ jobCounts: c }),
  enrichProgress: null,
  setEnrichProgress: (p) => set({ enrichProgress: p }),

  // MCP
  mcpConnected: false,
  setMcpConnected: (v) => set({ mcpConnected: v }),

  // Navigation
  activeView: 'setup',
  setActiveView: (v) => set({ activeView: v })
}))
