import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toUnifiedDiff } from './diff'

/**
 * The unified-diff output is checked against `git apply`, not against a string
 * shape.
 *
 * This distinction is the whole point of the file. The original tests asserted
 * that the output contained `@@`, a `-b`, and a `+x`, and they passed happily
 * while the patch was rejected by git for three separate reasons: an off-by-one
 * line count from the phantom trailing line, a missing final newline, and a
 * missing `\ No newline at end of file` marker. A test that checks the shape of
 * an interoperability format tests your own idea of the format. Handing it to
 * the real consumer tests the format.
 */

function applies(before: string, after: string): { ok: boolean; error?: string; result?: string } {
  const dir = mkdtempSync(join(tmpdir(), 'devdock-patch-'))
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
    git('init', '--quiet')
    git('config', 'user.email', 'test@example.invalid')
    git('config', 'user.name', 'Test')

    writeFileSync(join(dir, 'file.txt'), before)
    git('add', 'file.txt')
    git('commit', '--quiet', '-m', 'base')

    const patch = toUnifiedDiff(before, after, { leftName: 'a/file.txt', rightName: 'b/file.txt' })
    writeFileSync(join(dir, 'change.patch'), patch)

    git('apply', '--verbose', 'change.patch')
    const result = execFileSync('cat', [join(dir, 'file.txt')], { encoding: 'utf8' })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('toUnifiedDiff produces patches git actually applies', () => {
  it('a change in the middle of a file that ends with a newline', () => {
    const before = 'alpha\nbravo\ncharlie\n'
    const after = 'alpha\nBRAVO\ncharlie\n'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('an insertion, when the file ends with a newline', () => {
    const before = 'alpha\nbravo\ncharlie\n'
    const after = 'alpha\nbravo\nnew line\ncharlie\n'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('a file that does not end with a newline', () => {
    const before = 'alpha\nbravo\ncharlie'
    const after = 'alpha\nBRAVO\ncharlie'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('adding a trailing newline to a file that lacked one', () => {
    const before = 'alpha\nbravo'
    const after = 'alpha\nbravo\n'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('removing the trailing newline from a file that had one', () => {
    const before = 'alpha\nbravo\n'
    const after = 'alpha\nbravo'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('two changes far enough apart to need separate hunks', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`)
    const before = `${lines.join('\n')}\n`
    const changed = [...lines]
    changed[2] = 'CHANGED EARLY'
    changed[35] = 'CHANGED LATE'
    const after = `${changed.join('\n')}\n`
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('a deletion at the very start of the file', () => {
    const before = 'first\nsecond\nthird\n'
    const after = 'second\nthird\n'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('an append at the very end of the file', () => {
    const before = 'first\nsecond\n'
    const after = 'first\nsecond\nthird\n'
    const outcome = applies(before, after)
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe(after)
  })

  it('emptying a file entirely', () => {
    const outcome = applies('only line\n', '')
    expect(outcome.error).toBeUndefined()
    expect(outcome.result).toBe('')
  })
})

describe('toUnifiedDiff formatting details', () => {
  it('counts lines the way diff -u does, without the phantom trailing line', () => {
    const patch = toUnifiedDiff('a\nb\nc\n', 'a\nb\nX\nc\n')
    expect(patch).toMatch(/^@@ -1,3 \+1,4 @@$/m)
  })

  it('ends with a newline', () => {
    expect(toUnifiedDiff('a\n', 'b\n').endsWith('\n')).toBe(true)
  })

  it('marks a side that does not end with a newline', () => {
    expect(toUnifiedDiff('a\nb', 'a\nc')).toContain('\\ No newline at end of file')
  })

  it('does not mark a side that does end with a newline', () => {
    expect(toUnifiedDiff('a\nb\n', 'a\nc\n')).not.toContain('No newline')
  })

  it('reports a pure trailing-newline change rather than calling the files identical', () => {
    expect(toUnifiedDiff('a\n', 'a')).not.toBe('')
  })

  it('returns an empty string when the files are genuinely identical', () => {
    expect(toUnifiedDiff('a\nb\n', 'a\nb\n')).toBe('')
  })
})
