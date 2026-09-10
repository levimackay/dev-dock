import { executeRegex, type RegexRequest } from './regexTypes'

/**
 * Runs user regular expressions off the main thread.
 *
 * This exists for one reason: **catastrophic backtracking**. A pattern like
 * `(a+)+$` against forty a's followed by a `!` takes exponential time, and
 * JavaScript's regex engine is not interruptible. There is no timeout option,
 * no abort signal, and no way to ask it to stop. On the main thread that is a
 * frozen tab with no recovery.
 *
 * A worker is the only real defence available in a browser: the *main* thread
 * stays responsive, and `worker.terminate()` kills the runaway synchronously
 * from outside. That turns an unbounded hang into a bounded error message.
 */
// There is deliberately no `event.origin` check here, and a scanner will flag
// its absence. That check belongs on `window.onmessage`, where any frame on any
// origin can post to you. This is a *dedicated* worker: the only thing that
// can post to it is the page that constructed it, and `event.origin` is the
// empty string for every such message. A guard comparing against the empty
// string would always pass and prove nothing. The request shape is untrusted
// input regardless, and `executeRegex` treats it that way.
self.onmessage = (event: MessageEvent<RegexRequest>) => {
  self.postMessage(executeRegex(event.data))
}
