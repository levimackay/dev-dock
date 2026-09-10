import { executeRegex, type RegexRequest } from './regexTypes'

/**
 * Runs user regular expressions off the main thread.
 *
 * This exists for one reason: **catastrophic backtracking**. A pattern like
 * `(a+)+$` against forty a's followed by a `!` takes exponential time, and
 * JavaScript's regex engine is not interruptible — there is no timeout option,
 * no abort signal, and no way to ask it to stop. On the main thread that is a
 * frozen tab with no recovery.
 *
 * A worker is the only real defence available in a browser: the *main* thread
 * stays responsive, and `worker.terminate()` kills the runaway synchronously
 * from outside. That turns an unbounded hang into a bounded error message.
 */
self.onmessage = (event: MessageEvent<RegexRequest>) => {
  self.postMessage(executeRegex(event.data))
}
