import { executeRegex, type RegexRequest, type RegexResponse } from './regexTypes'

/**
 * Main-thread client for the regex worker.
 *
 * One long-lived worker is reused across keystrokes, because spinning one up
 * per character is measurable. When a run exceeds the timeout the worker is
 * terminated: the only way to stop a backtracking regex, and the next call
 * transparently starts a fresh one.
 *
 * Where `Worker` is unavailable (jsdom under test, or a locked-down embed) the
 * same computation runs inline. That is a real correctness/robustness trade:
 * inline execution can still hang on a pathological pattern. It is accepted
 * only because the fallback never runs in a browser we ship to.
 */

const DEFAULT_TIMEOUT_MS = 1200

interface Pending {
  resolve: (value: RegexResponse) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker

  worker = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<RegexResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(event.data.id)
    entry.resolve(event.data)
  }
  worker.onerror = () => {
    // The worker died. Fail every outstanding request rather than leaving
    // promises hanging, and drop it so the next call rebuilds one.
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.resolve({ id, ok: false, kind: 'internal', error: 'The regex worker crashed.' })
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function killWorker(): void {
  worker?.terminate()
  worker = null
}

export function runRegex(
  request: Omit<RegexRequest, 'id'>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegexResponse> {
  const id = nextId++
  const full: RegexRequest = { ...request, id }
  const active = ensureWorker()

  if (!active) return Promise.resolve(executeRegex(full))

  // Supersede rather than queue.
  //
  // One worker handles messages serially, and the timer used to start when a
  // request was posted rather than when the worker picked it up. So a slow
  // pattern already running would burn most of the next request's budget
  // before it began, and a perfectly ordinary pattern would be reported as
  // catastrophic backtracking: the message named a cause that was not there.
  //
  // Superseding fixes the accounting and is what a type-as-you-go tool wants
  // anyway. The moment request N+1 exists, N's answer is for text nobody is
  // looking at. Everything outstanding is resolved as superseded, the worker is
  // replaced so the old pattern actually stops, and the new request is alone in
  // the queue with a clock that starts when it does.
  if (pending.size > 0) {
    for (const [pendingId, entry] of pending) {
      clearTimeout(entry.timer)
      entry.resolve({
        id: pendingId,
        ok: false,
        kind: 'superseded',
        error: 'A newer pattern replaced this one before it finished.',
      })
    }
    pending.clear()
    killWorker()
    const replacement = ensureWorker()
    if (!replacement) return Promise.resolve(executeRegex(full))
    return post(replacement, full, timeoutMs)
  }

  return post(active, full, timeoutMs)
}

function post(worker: Worker, full: RegexRequest, timeoutMs: number): Promise<RegexResponse> {
  const { id } = full

  return new Promise<RegexResponse>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      killWorker()
      resolve({
        id,
        ok: false,
        kind: 'timeout',
        error: `The pattern did not finish within ${timeoutMs} ms and was stopped. This usually means catastrophic backtracking, look for nested quantifiers such as (a+)+ or (\\w*)*.`,
      })
    }, timeoutMs)

    pending.set(id, { resolve, timer })
    worker.postMessage(full)
  })
}
