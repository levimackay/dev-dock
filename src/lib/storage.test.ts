import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetStorageProbe,
  clearAll,
  isStringArray,
  read,
  remove,
  storageAvailable,
  write,
} from './storage'

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetStorageProbe()
  })

  it('round-trips a value', () => {
    write('greeting', { hello: 'world' })
    expect(read('greeting', null)).toEqual({ hello: 'world' })
  })

  it('namespaces every key it writes', () => {
    write('pins', ['a'])
    expect(localStorage.getItem('devdock:pins')).toBe('["a"]')
    expect(localStorage.getItem('pins')).toBeNull()
  })

  it('returns the fallback for a missing key', () => {
    expect(read('nope', 'fallback')).toBe('fallback')
  })

  it('returns the fallback when the stored JSON is corrupt', () => {
    localStorage.setItem('devdock:broken', '{not json')
    expect(read('broken', 'fallback')).toBe('fallback')
  })

  it('returns the fallback when the stored value fails validation', () => {
    localStorage.setItem('devdock:pins', '{"not":"an array"}')
    expect(read('pins', ['default'], isStringArray)).toEqual(['default'])
  })

  it('accepts a stored value that passes validation', () => {
    write('pins', ['base64', 'uuid-generator'])
    expect(read('pins', [], isStringArray)).toEqual(['base64', 'uuid-generator'])
  })

  it('removes a single key', () => {
    write('temp', 1)
    remove('temp')
    expect(read('temp', null)).toBeNull()
  })

  it('clearAll only removes namespaced keys', () => {
    write('mine', 1)
    localStorage.setItem('someone-elses-key', 'keep me')
    clearAll()
    expect(read('mine', null)).toBeNull()
    expect(localStorage.getItem('someone-elses-key')).toBe('keep me')
  })

  it('degrades to the fallback when localStorage throws', () => {
    const spy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    __resetStorageProbe()
    expect(storageAvailable()).toBe(false)
    expect(write('x', 1)).toBe(false)
    expect(read('x', 'fallback')).toBe('fallback')
    spy.mockRestore()
  })
})
