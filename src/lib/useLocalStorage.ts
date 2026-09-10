import { useCallback, useEffect, useState } from 'react'
import { read, write, type Validator } from './storage'

/**
 * `useState` that persists, and that stays in sync across tabs.
 *
 * The cross-tab sync matters more than it looks: someone with Dev Dock open in
 * two tabs who pins a tool in one expects the other to agree. The `storage`
 * event fires in *other* tabs only, so there is no echo to guard against.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  isValid?: Validator<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial, isValid))

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        write(key, resolved)
        return resolved
      })
    },
    [key],
  )

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== `devdock:${key}`) return
      setValue(read(key, initial, isValid))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // `initial` and `isValid` are intentionally excluded: they are only read on
    // the fallback path, and including them would resubscribe on every render
    // for any caller that passes an inline object or arrow function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, set]
}
