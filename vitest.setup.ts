import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Node 26 ships its own `localStorage` global that is inert unless the process
 * was started with `--localstorage-file`. It sits on `globalThis` as a getter
 * returning `undefined`, which shadows the jsdom implementation vitest would
 * otherwise install. Rather than couple the test run to a Node CLI flag, we
 * install a spec-shaped in-memory Storage here.
 */
class MemoryStorage implements Storage {
  #map = new Map<string, string>()
  get length() {
    return this.#map.size
  }
  clear() {
    this.#map.clear()
  }
  getItem(key: string) {
    return this.#map.get(String(key)) ?? null
  }
  key(index: number) {
    return [...this.#map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.#map.delete(String(key))
  }
  setItem(key: string, value: string) {
    this.#map.set(String(key), String(value))
  }
  [name: string]: unknown
}

for (const target of [globalThis, window] as unknown as Array<Record<string, unknown>>) {
  Object.defineProperty(target, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom implements neither of these, and several tools depend on them.
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof globalThis.matchMedia
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
