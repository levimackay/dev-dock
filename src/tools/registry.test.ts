import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CATEGORIES, TOOLS, TOOL_BY_ID, getTool, toolsInCategory } from './registry'

/**
 * The registry is the single source of truth for what Dev Dock contains, and
 * README/ARCHITECTURE both claim that adding a tool means one registry entry
 * and one folder. Anywhere the count is written down by hand instead of derived
 * is a place that quietly starts lying on the day a 23rd tool lands, so the
 * hand-written copies are pinned here.
 */
describe('registry', () => {
  it('has a unique id for every tool', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length)
  })

  it('has a unique name for every tool', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length)
  })

  it('places every tool in a declared category', () => {
    const known = new Set(CATEGORIES.map((c) => c.id))
    for (const tool of TOOLS) expect(known.has(tool.category)).toBe(true)
  })

  it('leaves no category empty', () => {
    for (const category of CATEGORIES)
      expect(toolsInCategory(category.id).length).toBeGreaterThan(0)
  })

  it('gives every tool a tagline and search keywords', () => {
    for (const tool of TOOLS) {
      expect(tool.short.length).toBeGreaterThan(20)
      expect(tool.keywords.length).toBeGreaterThan(2)
    }
  })

  it('uses url-safe slugs', () => {
    for (const tool of TOOLS) expect(tool.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('flags exactly one tool as making network requests', () => {
    expect(TOOLS.filter((t) => t.network).map((t) => t.id)).toEqual(['http-client'])
  })

  it('resolves ids through the lookup map', () => {
    expect(TOOL_BY_ID.size).toBe(TOOLS.length)
    expect(getTool('base64')?.name).toBe('Base64')
    expect(getTool('nope')).toBeUndefined()
    expect(getTool(undefined)).toBeUndefined()
  })

  it('keeps the hand-written counts in package.json and index.html in step', () => {
    const count = String(TOOLS.length)
    expect(readFileSync('package.json', 'utf8')).toContain(`${count} developer utilities`)
    expect(readFileSync('index.html', 'utf8')).toContain(`${count} fast developer utilities`)
  })
})
