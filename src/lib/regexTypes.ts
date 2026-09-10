/** Shared message shapes between the regex worker and its main-thread client. */

export interface RegexRequest {
  id: number
  pattern: string
  flags: string
  text: string
  /** When set, also compute the result of `String.replace`. */
  replacement?: string
  /** Hard cap on matches collected, so a `.*` on a huge file cannot blow memory. */
  maxMatches: number
}

export interface RegexMatch {
  index: number
  length: number
  text: string
  groups: Array<string | undefined>
  named: Record<string, string | undefined>
}

export interface RegexSuccess {
  id: number
  ok: true
  matches: RegexMatch[]
  truncated: boolean
  replaced?: string
  elapsedMs: number
}

export interface RegexFailure {
  id: number
  ok: false
  error: string
  kind: 'syntax' | 'timeout' | 'internal'
}

export type RegexResponse = RegexSuccess | RegexFailure

/**
 * Runs a user-supplied pattern. Exported separately from the worker so the same
 * code path can be unit-tested and used as a fallback where Workers are absent.
 */
export function executeRegex(request: RegexRequest): RegexResponse {
  const started = performance.now()
  let re: RegExp
  try {
    re = new RegExp(request.pattern, request.flags)
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      kind: 'syntax',
      error: error instanceof Error ? error.message : 'Invalid regular expression.',
    }
  }

  const matches: RegexMatch[] = []
  let truncated = false

  try {
    if (re.global || re.sticky) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(request.text)) !== null) {
        matches.push(toMatch(match))
        if (matches.length >= request.maxMatches) {
          truncated = true
          break
        }
        // A zero-length match would otherwise loop forever on the same index.
        if (match[0] === '') re.lastIndex++
      }
    } else {
      const match = re.exec(request.text)
      if (match) matches.push(toMatch(match))
    }

    const response: RegexSuccess = {
      id: request.id,
      ok: true,
      matches,
      truncated,
      elapsedMs: performance.now() - started,
    }

    if (request.replacement !== undefined) {
      response.replaced = request.text.replace(
        re.global ? re : new RegExp(request.pattern, `${request.flags}g`),
        request.replacement,
      )
    }

    return response
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      kind: 'internal',
      error: error instanceof Error ? error.message : 'The pattern failed while running.',
    }
  }
}

function toMatch(match: RegExpExecArray): RegexMatch {
  return {
    index: match.index,
    length: match[0].length,
    text: match[0],
    groups: match.slice(1),
    named: { ...match.groups },
  }
}
