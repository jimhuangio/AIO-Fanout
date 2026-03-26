// Simple in-process job queue — no external dependency needed.
// Concurrency + rate-limiting without p-queue (which is ESM-only).
import {
  getPendingKeywords,
  markKeywordQueued,
  getJobCounts,
  getProjectMeta,
  getClusterableKeywords,
  getUnenrichedKeywords,
  clearTopics,
  insertTopics
} from '../db'
import { processKeyword, setRunMeta, clearRunMeta } from './worker'
import { runEnrichment } from './enrich'
import { runClustering, runCategorisation } from '../topics/run'
import { crawlScheduler } from '../crawler/scheduler'
import type { BrowserWindow } from 'electron'

type Task = () => Promise<void>

class SimpleQueue {
  private queue: Task[] = []
  private running = 0
  private paused = false
  private tokenBucket: number
  private lastRefill: number
  onDrain?: () => void

  constructor(
    private concurrency: number,
    private tokensPerMinute: number
  ) {
    this.tokenBucket = tokensPerMinute
    this.lastRefill = Date.now()
  }

  get size(): number {
    return this.queue.length + this.running
  }

  add(task: Task): void {
    this.queue.push(task)
    this.drain()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.drain()
  }

  clear(): void {
    this.queue = []
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const tokensToAdd = Math.floor((elapsed / 60_000) * this.tokensPerMinute)
    if (tokensToAdd > 0) {
      this.tokenBucket = Math.min(this.tokensPerMinute, this.tokenBucket + tokensToAdd)
      this.lastRefill = now
    }
  }

  private drain(): void {
    if (this.paused) return

    this.refillTokens()

    while (
      this.queue.length > 0 &&
      this.running < this.concurrency &&
      this.tokenBucket > 0
    ) {
      const task = this.queue.shift()!
      this.running++
      this.tokenBucket--

      task()
        .catch((err) => console.error('[queue] task error:', err))
        .finally(() => {
          this.running--
          if (this.queue.length === 0 && this.running === 0 && !this.paused) {
            this.onDrain?.()
          }
          // Schedule next drain after a tick to avoid stack overflow
          setImmediate(() => this.drain())
        })
    }

    // If rate-limited, retry after tokens refill
    if (this.queue.length > 0 && this.running < this.concurrency && this.tokenBucket === 0) {
      const msPerToken = 60_000 / this.tokensPerMinute
      setTimeout(() => this.drain(), msPerToken)
    }
  }
}

export class FanoutScheduler {
  private queue: SimpleQueue
  private window: BrowserWindow | null = null
  private running = false
  private progressInterval: NodeJS.Timeout | null = null

  constructor(
    private concurrency = 5,
    private tasksPerMinute = 300
  ) {
    this.queue = new SimpleQueue(concurrency, tasksPerMinute)
  }

  setWindow(win: BrowserWindow): void {
    this.window = win
    crawlScheduler.setWindow(win)
  }

  async start(): Promise<void> {
    setRunMeta(getProjectMeta())
    this.running = true
    this.startProgressBroadcast()

    this.queue.onDrain = () => {
      // Fires when queue + in-flight both reach zero.
      // Only enrich if the run is still active and all keywords are processed.
      if (!this.running) return
      if (getPendingKeywords().length > 0) return
      this.startEnrichment()
    }

    const pending = getPendingKeywords()
    if (pending.length === 0) {
      // All keywords already processed — skip SERP work, go straight to enrichment
      console.log('[scheduler] no pending keywords — going straight to enrichment')
      this.startEnrichment()
    } else {
      this.drainPending()
    }
  }

  private startEnrichment(): void {
    this.runEnrichmentWithRetry(1)
      .then(() => {
        // Keyword research + enrichment done — schedule grouping after crawling finishes
        this.scheduleGroupingAfterCrawl()
      })
      .catch(err => console.error('[scheduler] enrichment error:', err))
      .finally(() => {
        this.broadcastProgress()
        this.broadcastComplete()
        this.stop()
      })
  }

  private scheduleGroupingAfterCrawl(): void {
    if (crawlScheduler.isIdle) {
      // Crawling already finished (or never started) — group now
      void this.runGrouping()
    } else {
      // Wait for crawling to finish, then group
      crawlScheduler.onComplete = () => { void this.runGrouping() }
      console.log('[scheduler] grouping deferred — waiting for crawl to complete')
    }
  }

  private async runGrouping(): Promise<void> {
    console.log('[scheduler] starting grouping (clustering + categorisation)')
    const inputs = getClusterableKeywords()
    if (inputs.length === 0) return
    try {
      const clusters = await runClustering(inputs)
      clearTopics()
      insertTopics(clusters)
      console.log(`[scheduler] grouped ${clusters.length} topics`)
      await runCategorisation()
    } catch (err) {
      console.error('[scheduler] grouping error:', err)
    } finally {
      this.window?.webContents.send('topics:updated')
    }
  }

  private async runEnrichmentWithRetry(attempt: number): Promise<void> {
    const MAX_ATTEMPTS = 3
    console.log(`[scheduler] starting enrichment (attempt ${attempt}/${MAX_ATTEMPTS})`)
    await runEnrichment(
      () => !this.running,
      (done, total) => {
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('enrich:progress', { done, total })
        }
      }
    )
    if (attempt < MAX_ATTEMPTS && getUnenrichedKeywords().length > 0) {
      console.log(`[scheduler] unenriched keywords remain — retrying (attempt ${attempt + 1})`)
      await this.runEnrichmentWithRetry(attempt + 1)
    }
  }

  private broadcastComplete(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.webContents.send('run:complete')
  }

  pause(): void {
    this.running = false
    this.queue.pause()
    this.stopProgressBroadcast()
    console.log('[scheduler] paused')
  }

  resume(): void {
    this.running = true
    this.queue.resume()
    this.startProgressBroadcast()
    this.drainPending()
    console.log('[scheduler] resumed')
  }

  stop(): void {
    this.running = false
    this.queue.onDrain = undefined
    this.queue.pause()
    this.queue.clear()
    this.stopProgressBroadcast()
    clearRunMeta()
    console.log('[scheduler] stopped')
  }

  get isRunning(): boolean {
    return this.running
  }

  // Called by worker when it discovers new child keywords
  addChildren(childIds: number[]): void {
    if (!this.running) return
    for (const id of childIds) {
      markKeywordQueued(id)
      this.queue.add(() => processKeyword(id, this.workerCallbacks()))
    }
  }

  private workerCallbacks() {
    return {
      onChildrenAdded: (ids: number[]) => this.addChildren(ids),
      onProgress: () => this.broadcastProgress(),
      onNewURLs: (urls: string[]) => crawlScheduler.feedURLs(urls)
    }
  }

  private drainPending(): void {
    const pending = getPendingKeywords()
    console.log(`[scheduler] draining ${pending.length} pending keywords`)

    for (const kw of pending) {
      if (!this.running) break
      markKeywordQueued(kw.id)
      this.queue.add(() => processKeyword(kw.id, this.workerCallbacks()))
    }
  }

  private broadcastProgress(): void {
    if (!this.window || this.window.isDestroyed()) return
    const counts = getJobCounts()
    this.window.webContents.send('run:progress', counts)
  }

  private startProgressBroadcast(): void {
    this.stopProgressBroadcast()
    this.progressInterval = setInterval(() => this.broadcastProgress(), 2000)
  }

  private stopProgressBroadcast(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }
}

export const scheduler = new FanoutScheduler()
