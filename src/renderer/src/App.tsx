import { useState } from 'react'
import tomboLogo from './assets/tombo-group-logo.png'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from './store/app-store'
import { JobStatusBar } from './components/JobStatusBar'
import { SetupView } from './views/SetupView'
import { KeywordsView } from './views/KeywordsView'
import { AIOPositionsView } from './views/AIOPositionsView'
import { CrawlerView } from './views/CrawlerView'
import { TopicsView } from './views/TopicsView'

const NAV_ITEMS = [
  { id: 'setup', label: 'Setup', icon: '⚙' },
  { id: 'keywords', label: 'Keywords', icon: '🔑' },
  { id: 'positions', label: 'AIO Positions', icon: '📊' },
  { id: 'crawler', label: 'Crawler', icon: '🕷' },
  { id: 'topics', label: 'Topics', icon: '🗂' }
] as const

export default function App(): JSX.Element {
  const { activeView, setActiveView, project, jobCounts } = useAppStore()
  const [sidebarError, setSidebarError] = useState<string>('')

  const { data: stats } = useQuery({
    queryKey: ['project', 'stats'],
    queryFn: () => window.api.getProjectStats(),
    enabled: !!project,
    refetchInterval: 5000
  })

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900">
      {/* Sidebar */}
      <div className="w-48 flex-shrink-0 flex flex-col bg-gray-50 border-r border-gray-200">
        {/* App title */}
        <div className="px-4 pt-5 pb-3 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <a href="https://www.tombogroup.com" target="_blank" rel="noreferrer" className="shrink-0">
              <img
                src={tomboLogo}
                alt="Tombo Group"
                className="h-5 w-auto"
              />
            </a>
            <span className="text-sm font-bold text-gray-900 tracking-tight">AIO Audit Tool</span>
          </div>
          {project && (
            <div className="text-xs text-gray-400 truncate" title={project.name}>
              {project.name}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id
            const hasData =
              item.id === 'keywords'
                ? jobCounts.done + jobCounts.pending + jobCounts.error > 0
                : item.id === 'positions'
                ? jobCounts.done > 0
                : false

            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as typeof activeView)}
                disabled={!project && item.id !== 'setup'}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors text-left
                  ${isActive
                    ? 'bg-white text-blue-700 font-medium border-r-2 border-blue-600'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'}
                  ${!project && item.id !== 'setup' ? 'opacity-30 cursor-not-allowed' : ''}
                `}
              >
                <span className="w-4 text-center">{item.icon}</span>
                <span>{item.label}</span>
                {hasData && !isActive && (
                  <span className="ml-auto w-1.5 h-1.5 bg-blue-500 rounded-full" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Live project stats */}
        {project && stats && (
          <div className="px-4 py-3 border-t border-gray-200 space-y-1.5">
            <Stat label="Keywords" value={stats.totalKeywords} />
            <Stat label="With AIO" value={stats.keywordsWithAIO} highlight />
            <Stat label="Domains" value={stats.uniqueDomains} />
            {stats.errorKeywords > 0 && (
              <Stat label="Errors" value={stats.errorKeywords} error />
            )}
          </div>
        )}

        {/* Generate Report */}
        {project && (
          <div className="px-3 pb-2 border-t border-gray-200 pt-2">
            <ReportButton />
          </div>
        )}

        {/* Project controls */}
        <div className="p-3 border-t border-gray-200 space-y-1">
          <button
            onClick={() => {
              setSidebarError('')
              window.api.openProject()
                .then((m) => m && useAppStore.getState().setProject(m))
                .catch((err) => setSidebarError(String(err).replace('Error: ', '')))
            }}
            className="w-full text-xs text-left px-2 py-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            Open project…
          </button>
          <button
            onClick={() => {
              setSidebarError('')
              window.api.createProject()
                .then((m) => m && useAppStore.getState().setProject(m))
                .catch((err) => setSidebarError(String(err).replace('Error: ', '')))
            }}
            className="w-full text-xs text-left px-2 py-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            New project…
          </button>
          {sidebarError && (
            <div className="mt-1 text-xs text-red-500 break-all">{sidebarError}</div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Job status bar */}
        {project && <JobStatusBar />}

        {/* View content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'setup' && <SetupView />}
          {activeView === 'keywords' && <KeywordsView />}
          {activeView === 'positions' && <AIOPositionsView />}
          {activeView === 'crawler' && <CrawlerView />}
          {activeView === 'topics' && <TopicsView />}
        </div>
      </div>
    </div>
  )
}

function ReportButton(): JSX.Element {
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleGenerate(): Promise<void> {
    setGenerating(true)
    setMsg('')
    try {
      await window.api.generateReport()
      setMsg('Opened!')
      setTimeout(() => setMsg(''), 3000)
    } catch (err) {
      setMsg(String(err).replace('Error: ', '').slice(0, 60))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full text-xs text-left px-2 py-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 disabled:opacity-40 rounded transition-colors font-medium"
      >
        {generating ? 'Generating…' : '↗ Generate Report'}
      </button>
      {msg && (
        <div className={`text-xs px-2 mt-0.5 ${msg === 'Opened!' ? 'text-green-600' : 'text-red-500'} break-all`}>
          {msg}
        </div>
      )}
    </div>
  )
}

function Stat({
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
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-400">{label}</span>
      <span
        className={`text-xs tabular-nums font-semibold ${
          error ? 'text-red-500' : highlight ? 'text-blue-600' : 'text-gray-600'
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  )
}
