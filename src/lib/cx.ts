/**
 * Conditional class-name joiner.
 *
 * `clsx` is 200 bytes of dependency for eight lines of code that never change.
 * Falsy values are dropped so `cond && styles.x` reads naturally at call sites.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = ''
  for (const part of parts) {
    if (!part) continue
    out = out ? `${out} ${part}` : part
  }
  return out
}
