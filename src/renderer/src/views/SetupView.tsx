import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import type { ProjectMeta } from '../../../types'

// DataForSEO location codes (common ones)
const LOCATIONS = [
  { code: 2840, label: 'United States' },
  { code: 2826, label: 'United Kingdom' },
  { code: 2036, label: 'Australia' },
  { code: 2124, label: 'Canada' },
  { code: 2276, label: 'Germany' },
  { code: 2250, label: 'France' },
  { code: 2724, label: 'Spain' },
  { code: 2380, label: 'Italy' },
  { code: 2528, label: 'Netherlands' },
  { code: 2702, label: 'Singapore' },
]

export function SetupView(): JSX.Element {
  const { project, setProject, setMcpConnected, mcpConnected } = useAppStore()

  return (
    <div className="p-6 max-w-2xl overflow-y-auto h-full space-y-8">
      <CredentialsSection project={project} />

      {!project ? (
        <ProjectCreate setProject={setProject} />
      ) : (
        <ProjectSettingsSection
          project={project}
          setProject={setProject}
          mcpConnected={mcpConnected}
          setMcpConnected={setMcpConnected}
        />
      )}
    </div>
  )
}

// ─── API Credentials (global, not per-project) ────────────────────────────────

function CredentialsSection({ project }: { project: ProjectMeta | null }): JSX.Element {
  const queryClient = useQueryClient()

  const { data: store = {} } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => window.api.getAllCredentials()
  })

  // DataForSEO API key (base64-encoded login:password)
  const [dfsApiKey, setDfsApiKey] = useState('')

  // Gemini API key
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [geminiSaveMsg, setGeminiSaveMsg] = useState('')
  const [geminiTestMsg, setGeminiTestMsg] = useState('')
  const [geminiTesting, setGeminiTesting] = useState(false)

  // Firecrawl API key
  const [firecrawlApiKey, setFirecrawlApiKey] = useState('')
  const [firecrawlSaveMsg, setFirecrawlSaveMsg] = useState('')
  const [firecrawlTestMsg, setFirecrawlTestMsg] = useState('')
  const [firecrawlTesting, setFirecrawlTesting] = useState(false)

  // Scrapling installer
  const [scraplingStatus, setScraplingStatus] = useState<{ python: boolean; scrapling: boolean } | null>(null)
  const [scraplingInstalling, setScraplingInstalling] = useState(false)
  const [scraplingInstallingBrowsers, setScraplingInstallingBrowsers] = useState(false)
  const [scraplingOutput, setScraplingOutput] = useState('')

  // Generic "other APIs" entries
  const [customEntries, setCustomEntries] = useState<{ service: string; key: string; value: string }[]>([])
  const [addingNew, setAddingNew] = useState(false)
  const [newService, setNewService] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const [saveMsg, setSaveMsg] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)

  // Check Scrapling install status on mount
  useEffect(() => {
    window.api.scraplingStatus().then(setScraplingStatus).catch(() => {})
  }, [])

  // Populate fields from stored credentials
  useEffect(() => {
    const dfs = store['dataforseo'] ?? {}
    setDfsApiKey(dfs.apiKey ?? '')

    setGeminiApiKey(store['gemini']?.apiKey ?? '')
    setFirecrawlApiKey(store['firecrawl']?.apiKey ?? '')

    const entries = Object.entries(store)
      .filter(([svc]) => svc !== 'dataforseo' && svc !== 'gemini' && svc !== 'firecrawl')
      .flatMap(([svc, fields]) =>
        Object.entries(fields).map(([key, value]) => ({ service: svc, key, value }))
      )
    setCustomEntries(entries)
  }, [store])

  async function handleTestDFS(): Promise<void> {
    setTesting(true)
    setTestMsg('')
    try {
      await window.api.mcpTestKey(dfsApiKey)
      setTestMsg('✓ Connected')
      setTimeout(() => setTestMsg(''), 3000)
    } catch (err) {
      setTestMsg(`✗ ${String(err).replace('Error: ', '')}`)
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveDFS(): Promise<void> {
    await window.api.saveCredentials('dataforseo', { apiKey: dfsApiKey })

    // If a project is open and has no API key yet, sync into project settings
    if (project && !project.dfsApiKey) {
      await window.api.updateProjectSettings({ dfsApiKey })
    }

    queryClient.invalidateQueries({ queryKey: ['credentials'] })
    setSaveMsg('Saved.')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function handleClearDFS(): Promise<void> {
    await window.api.removeCredentials('dataforseo')
    setDfsApiKey('')
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
    setSaveMsg('Cleared.')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function handleSaveGemini(): Promise<void> {
    await window.api.saveCredentials('gemini', { apiKey: geminiApiKey })
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
    setGeminiSaveMsg('Saved.')
    setTimeout(() => setGeminiSaveMsg(''), 2000)
  }

  async function handleTestGemini(): Promise<void> {
    setGeminiTesting(true)
    setGeminiTestMsg('')
    try {
      await window.api.geminiTestKey(geminiApiKey)
      setGeminiTestMsg('✓ Connected')
      setTimeout(() => setGeminiTestMsg(''), 3000)
    } catch (err) {
      setGeminiTestMsg(`✗ ${String(err).replace('Error: ', '')}`)
    } finally {
      setGeminiTesting(false)
    }
  }

  async function handleClearGemini(): Promise<void> {
    await window.api.removeCredentials('gemini')
    setGeminiApiKey('')
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
  }

  async function handleSaveFirecrawl(): Promise<void> {
    await window.api.saveCredentials('firecrawl', { apiKey: firecrawlApiKey })
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
    setFirecrawlSaveMsg('Saved.')
    setTimeout(() => setFirecrawlSaveMsg(''), 2000)
  }

  async function handleTestFirecrawl(): Promise<void> {
    setFirecrawlTesting(true)
    setFirecrawlTestMsg('')
    try {
      await window.api.firecrawlTestKey(firecrawlApiKey)
      setFirecrawlTestMsg('✓ Connected')
      setTimeout(() => setFirecrawlTestMsg(''), 3000)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const clean = raw.replace(/Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
      setFirecrawlTestMsg(`✗ ${clean || raw}`)
    } finally {
      setFirecrawlTesting(false)
    }
  }

  async function handleClearFirecrawl(): Promise<void> {
    await window.api.removeCredentials('firecrawl')
    setFirecrawlApiKey('')
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
  }

  async function handleCheckScraplingStatus(): Promise<void> {
    setScraplingStatus(null)
    const status = await window.api.scraplingStatus()
    setScraplingStatus(status)
  }

  async function handleInstallScrapling(): Promise<void> {
    setScraplingInstalling(true)
    setScraplingOutput('')
    try {
      const result = await window.api.scraplingInstall()
      setScraplingOutput(result.output)
      if (result.ok) {
        const status = await window.api.scraplingStatus()
        setScraplingStatus(status)
      }
    } finally {
      setScraplingInstalling(false)
    }
  }

  async function handleInstallScraplingBrowsers(): Promise<void> {
    setScraplingInstallingBrowsers(true)
    setScraplingOutput('')
    try {
      const result = await window.api.scraplingInstallBrowsers()
      setScraplingOutput(result.output)
    } finally {
      setScraplingInstallingBrowsers(false)
    }
  }

  async function handleSaveCustom(service: string, key: string, value: string): Promise<void> {
    const current = store[service] ?? {}
    await window.api.saveCredentials(service, { ...current, [key]: value })
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
  }

  async function handleRemoveCustomField(service: string, key: string): Promise<void> {
    const current = { ...(store[service] ?? {}) }
    delete current[key]
    if (Object.keys(current).length === 0) {
      await window.api.removeCredentials(service)
    } else {
      await window.api.saveCredentials(service, current)
    }
    queryClient.invalidateQueries({ queryKey: ['credentials'] })
  }

  async function handleAddNew(): Promise<void> {
    if (!newService.trim() || !newKey.trim()) return
    await handleSaveCustom(newService.trim().toLowerCase().replace(/\s+/g, '_'), newKey.trim(), newValue)
    setNewService('')
    setNewKey('')
    setNewValue('')
    setAddingNew(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">API Credentials</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Stored globally on this machine, not inside project files.
          </p>
        </div>
      </div>

      {/* DataForSEO */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          DataForSEO
        </div>
        <div className="space-y-3 pl-1">
          <Field
            label="API Key"
            hint='base64(login:password) — copy from dashboard or run btoa("email:pass") in browser'
          >
            <input
              type="password"
              value={dfsApiKey}
              onChange={(e) => setDfsApiKey(e.target.value)}
              className={inputCls}
              placeholder="base64-encoded API key"
            />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveDFS}
              disabled={!dfsApiKey}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleTestDFS}
              disabled={testing || !dfsApiKey}
              className="px-4 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded transition-colors border border-gray-300"
            >
              {testing ? 'Testing…' : 'Test'}
            </button>
            <button
              onClick={handleClearDFS}
              disabled={!dfsApiKey}
              className="px-4 py-1.5 text-xs bg-white hover:bg-red-50 disabled:opacity-40 text-red-500 rounded transition-colors border border-red-200 hover:border-red-300"
            >
              Clear
            </button>
            {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
            {testMsg && (
              <span className={`text-xs ${testMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {testMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Gemini */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Google Gemini
        </div>
        <div className="space-y-3 pl-1">
          <Field
            label="API Key"
            hint="Used for AI-powered topic clustering. Get a key at aistudio.google.com"
          >
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className={inputCls}
              placeholder="AIza..."
            />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveGemini}
              disabled={!geminiApiKey}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleTestGemini}
              disabled={geminiTesting || !geminiApiKey}
              className="px-4 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded transition-colors border border-gray-300"
            >
              {geminiTesting ? 'Testing…' : 'Test'}
            </button>
            <button
              onClick={handleClearGemini}
              disabled={!geminiApiKey}
              className="px-4 py-1.5 text-xs bg-white hover:bg-red-50 disabled:opacity-40 text-red-500 rounded transition-colors border border-red-200 hover:border-red-300"
            >
              Clear
            </button>
            {geminiSaveMsg && <span className="text-xs text-green-600">{geminiSaveMsg}</span>}
            {geminiTestMsg && (
              <span className={`text-xs ${geminiTestMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {geminiTestMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Firecrawl */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Firecrawl
        </div>
        <div className="space-y-3 pl-1">
          <Field
            label="API Key"
            hint="JS-render fallback for YouTube, social, and bot-blocked pages. Optional."
          >
            <input
              type="password"
              value={firecrawlApiKey}
              onChange={(e) => setFirecrawlApiKey(e.target.value)}
              className={inputCls}
              placeholder="fc-..."
            />
          </Field>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveFirecrawl}
              disabled={!firecrawlApiKey}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleTestFirecrawl}
              disabled={firecrawlTesting || !firecrawlApiKey}
              className="px-4 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded transition-colors border border-gray-300"
            >
              {firecrawlTesting ? 'Testing…' : 'Test'}
            </button>
            <button
              onClick={handleClearFirecrawl}
              disabled={!firecrawlApiKey}
              className="px-4 py-1.5 text-xs bg-white hover:bg-red-50 disabled:opacity-40 text-red-500 rounded transition-colors border border-red-200 hover:border-red-300"
            >
              Clear
            </button>
            {firecrawlSaveMsg && <span className="text-xs text-green-600">{firecrawlSaveMsg}</span>}
            {firecrawlTestMsg && (
              <span className={`text-xs ${firecrawlTestMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                {firecrawlTestMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scrapling */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Scrapling (JS Crawler)
        </div>
        <div className="space-y-3 pl-1">
          <p className="text-xs text-gray-500">
            Local JS rendering + Cloudflare bypass. Tier 2 crawler — no API key required.
            Requires Python 3 and the Scrapling package with Playwright browsers.
          </p>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500 w-24">Python 3</span>
            {scraplingStatus === null ? (
              <span className="text-gray-400">Checking…</span>
            ) : scraplingStatus.python ? (
              <span className="text-green-600">✓ Available</span>
            ) : (
              <span className="text-red-500">✗ Not found — install Python 3 from python.org</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-gray-500 w-24">Scrapling</span>
            {scraplingStatus === null ? (
              <span className="text-gray-400">Checking…</span>
            ) : scraplingStatus.scrapling ? (
              <span className="text-green-600">✓ Installed</span>
            ) : (
              <span className="text-orange-500">✗ Not installed</span>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={handleCheckScraplingStatus}
              className="px-4 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors border border-gray-300"
            >
              Check Status
            </button>
            <button
              onClick={handleInstallScrapling}
              disabled={scraplingInstalling || scraplingStatus?.scrapling === true}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
            >
              {scraplingInstalling ? 'Installing…' : 'Install Scrapling'}
            </button>
            <button
              onClick={handleInstallScraplingBrowsers}
              disabled={scraplingInstallingBrowsers || scraplingStatus?.scrapling !== true}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors"
              title="Installs Playwright Chromium browsers required for JS rendering"
            >
              {scraplingInstallingBrowsers ? 'Installing Browsers…' : 'Install Browsers'}
            </button>
          </div>
          {scraplingOutput && (
            <pre className="mt-2 p-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
              {scraplingOutput}
            </pre>
          )}
        </div>
      </div>

      {/* Other APIs */}
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Other APIs
        </div>
        <div className="space-y-2 pl-1">
          {customEntries.length === 0 && !addingNew && (
            <p className="text-xs text-gray-400">No other API credentials stored.</p>
          )}

          {customEntries.map((entry) => (
            <div key={`${entry.service}:${entry.key}`} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono w-32 shrink-0 truncate" title={entry.service}>
                {entry.service}
              </span>
              <span className="text-xs text-gray-500 w-28 shrink-0 truncate" title={entry.key}>
                {entry.key}
              </span>
              <input
                type="password"
                defaultValue={entry.value}
                onBlur={(e) => handleSaveCustom(entry.service, entry.key, e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                onClick={() => handleRemoveCustomField(entry.service, entry.key)}
                className="text-gray-300 hover:text-red-500 text-sm shrink-0 transition-colors"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}

          {addingNew && (
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                placeholder="service (e.g. openai)"
                className={`${inputCls} w-32`}
              />
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="field (e.g. apiKey)"
                className={`${inputCls} w-28`}
              />
              <input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="value"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                onClick={handleAddNew}
                disabled={!newService.trim() || !newKey.trim()}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition-colors shrink-0"
              >
                Add
              </button>
              <button
                onClick={() => setAddingNew(false)}
                className="text-gray-400 hover:text-gray-700 text-sm shrink-0 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {!addingNew && (
            <button
              onClick={() => setAddingNew(true)}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors pt-1"
            >
              + Add API credential
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── No-project state ─────────────────────────────────────────────────────────

function ProjectCreate({ setProject }: { setProject: (p: ProjectMeta) => void }): JSX.Element {
  const [error, setError] = useState('')

  async function handleCreate(): Promise<void> {
    setError('')
    try {
      const meta = await window.api.createProject()
      if (meta) setProject(meta)
    } catch (err) {
      setError(String(err).replace('Error: ', ''))
    }
  }

  async function handleOpen(): Promise<void> {
    setError('')
    try {
      const meta = await window.api.openProject()
      if (meta) setProject(meta)
    } catch (err) {
      setError(String(err).replace('Error: ', ''))
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Project</h2>
      <div className="flex gap-3 pl-1">
        <button
          onClick={handleCreate}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
        >
          + New Project
        </button>
        <button
          onClick={handleOpen}
          className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded border border-gray-300 transition-colors"
        >
          Open Existing…
        </button>
      </div>
      {error && (
        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-mono break-all">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Project Settings (per-project) ──────────────────────────────────────────

function ProjectSettingsSection({
  project,
  setProject,
  mcpConnected,
  setMcpConnected
}: {
  project: ProjectMeta
  setProject: (p: ProjectMeta | null) => void
  mcpConnected: boolean
  setMcpConnected: (v: boolean) => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const { setRunStatus, setJobCounts } = useAppStore()
  const [form, setForm] = useState<Partial<ProjectMeta>>(project)
  const [exclusionInput, setExclusionInput] = useState((project.exclusionKeywords ?? []).join('\n'))
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [connectError, setConnectError] = useState('')
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    setForm(project)
    setExclusionInput((project.exclusionKeywords ?? []).join('\n'))
  }, [project])

  async function handleSave(): Promise<void> {
    setSaving(true)
    setSaveMsg('')
    try {
      const exclusionKeywords = exclusionInput
        .split('\n')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
      const updated = await window.api.updateProjectSettings({ ...form, exclusionKeywords })
      setProject(updated)
      setSaveMsg('Saved.')
      setTimeout(() => setSaveMsg(''), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleConnect(): Promise<void> {
    setConnecting(true)
    setConnectError('')
    try {
      await window.api.mcpConnect()
      setMcpConnected(true)
    } catch (err) {
      setConnectError(String(err))
      setMcpConnected(false)
    } finally {
      setConnecting(false)
    }
  }

  async function handleCloseProject(): Promise<void> {
    setClosing(true)
    try {
      await window.api.closeProject()
      queryClient.clear()
      setRunStatus('idle')
      setJobCounts({ pending: 0, queued: 0, running: 0, done: 0, error: 0 })
      setMcpConnected(false)
      setProject(null)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 mb-6">Project Settings</h2>

      <Section title="Project">
        <Field label="Name">
          <input
            value={form.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="DataForSEO Connection">
        <Field label="API Key" hint="Override global API key for this project only — leave blank to use global">
          <input
            type="password"
            value={form.dfsApiKey ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, dfsApiKey: e.target.value }))}
            className={inputCls}
            placeholder="uses global API key if blank"
          />
        </Field>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded transition-colors"
          >
            {connecting ? 'Testing...' : mcpConnected ? '✓ Connected' : 'Test Connection'}
          </button>
        </div>

        {connectError && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-600 font-mono break-all">
            {connectError}
          </div>
        )}
      </Section>

      <Section title="Search Settings">
        <Field label="Location">
          <select
            value={form.locationCode ?? 2840}
            onChange={(e) => setForm((f) => ({ ...f, locationCode: Number(e.target.value) }))}
            className={inputCls}
          >
            {LOCATIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select
            value={form.languageCode ?? 'en'}
            onChange={(e) => setForm((f) => ({ ...f, languageCode: e.target.value }))}
            className={inputCls}
          >
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="it">Italian</option>
            <option value="nl">Dutch</option>
          </select>
        </Field>
        <Field label="Device">
          <select
            value={form.device ?? 'desktop'}
            onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))}
            className={inputCls}
          >
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </Field>
      </Section>

      <Section title="Export">
        <Field label="Export Folder" hint="Where reports and briefs are saved. Leave blank to use system temp.">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={form.exportDir ?? ''}
              placeholder="System temp folder (default)"
              className={`${inputCls} flex-1 text-gray-500 cursor-default`}
            />
            <button
              type="button"
              onClick={async () => {
                const dir = await window.api.selectExportDir()
                if (dir) setForm((f) => ({ ...f, exportDir: dir }))
              }}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 transition-colors whitespace-nowrap"
            >
              Browse…
            </button>
            {form.exportDir && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, exportDir: '' }))}
                className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="Clear"
              >
                ×
              </button>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Fan-Out Settings">
        <Field label="Max Depth" hint="1 = input keywords only, 2 = + their PAA/suggested searches">
          <input
            type="number"
            min={1}
            max={4}
            value={form.fanOutDepth ?? 2}
            onChange={(e) => setForm((f) => ({ ...f, fanOutDepth: Number(e.target.value) }))}
            className={`${inputCls} w-24`}
          />
        </Field>
        <Field label="Children Per Keyword" hint="0 = no children, 1–98 = cap at N, 99 = unlimited">
          <input
            type="number"
            min={0}
            max={99}
            value={form.fanOutCap ?? 99}
            onChange={(e) => setForm((f) => ({ ...f, fanOutCap: Number(e.target.value) }))}
            className={`${inputCls} w-24`}
            placeholder="99 = unlimited"
          />
        </Field>
        <Field label="Suggested Searches" hint="Use Google's related searches as additional child keywords">
          <select
            value={form.childSource ?? 'none'}
            onChange={(e) => setForm((f) => ({ ...f, childSource: e.target.value as ProjectMeta['childSource'] }))}
            className={inputCls}
          >
            <option value="none">Not at all</option>
            <option value="instead_of_paa">Instead of PAA</option>
            <option value="with_paa">With PAA</option>
          </select>
        </Field>
        <Field
          label="Exclusion Keywords"
          hint="One per line. Child keywords containing any of these phrases are skipped."
        >
          <textarea
            rows={5}
            value={exclusionInput}
            onChange={(e) => setExclusionInput(e.target.value)}
            className={`${inputCls} w-full resize-y font-mono`}
            placeholder={`casino\ngambling\nadult\n...`}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs rounded transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saveMsg && <span className="text-xs text-green-600">{saveMsg}</span>}
      </div>

      {/* Close Project */}
      <div className="mt-10 pt-6 border-t border-gray-200">
        <div className="pl-1">
          <button
            onClick={handleCloseProject}
            disabled={closing}
            className="px-4 py-1.5 text-xs bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 rounded border border-gray-300 hover:border-gray-400 transition-colors"
          >
            {closing ? 'Closing…' : 'Close project'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Closes this project file. You can open or create another without restarting the app.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-3 pl-1">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-600">
        {label}
        {hint && <span className="ml-2 text-gray-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'px-2 py-1.5 text-xs bg-white border border-gray-300 rounded text-gray-900 focus:outline-none focus:border-blue-500 transition-colors'
