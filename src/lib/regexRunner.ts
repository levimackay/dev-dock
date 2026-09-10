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
    active.postMessage(full)
  })
}
