import { describe, expect, it } from 'vitest'
import { DIALECTS, formatSql, isSqlDialect } from './sql'

const base = { dialect: 'sql' as const, keywordCase: 'upper' as const, indentWidth: 2, linesBetweenQueries: 1, minify: false }

describe('formatSql', () => {
  it('formats a known-messy query', () => {
    const result = formatSql('select id,name from   users where active=1 order by name', base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Reformatted onto multiple lines with the clauses each on their own line.
    expect(result.output).toContain('SELECT\n')
    expect(result.output).toContain('FROM\n')
    expect(result.output).toContain('WHERE\n')
    expect(result.output).toContain('ORDER BY\n')
    expect(result.output.split('\n').length).toBeGreaterThan(1)
  })

  it('returns empty output for empty input', () => {
    expect(formatSql('', base)).toEqual({ ok: true, output: '' })
    expect(formatSql('   ', base)).toEqual({ ok: true, output: '' })
  })

  it('applies the requested keyword case', () => {
    const upper = formatSql('select * from t', { ...base, keywordCase: 'upper' })
    const lower = formatSql('SELECT * FROM t', { ...base, keywordCase: 'lower' })
    if (!upper.ok || !lower.ok) throw new Error('expected success')
    expect(upper.output).toContain('SELECT')
    expect(lower.output).toContain('select')
    expect(lower.output).not.toContain('SELECT')
  })

  it('changes output when the dialect changes', () => {
    // Backtick-quoted identifiers are MySQL syntax and nothing else's —
    // proof the dialect option actually reaches the parser, not just a
    // cosmetic setting.
    const query = 'SELECT `id` FROM `users`'
    const mysql = formatSql(query, { ...base, dialect: 'mysql' })
    const postgres = formatSql(query, { ...base, dialect: 'postgresql' })
    expect(mysql.ok).toBe(true)
    expect(postgres.ok).toBe(false)
  })

  it('collapses whitespace when minify is on', () => {
    const result = formatSql('select id,\n  name\nfrom users', { ...base, minify: true })
    if (!result.ok) throw new Error('expected success')
    expect(result.output).not.toContain('\n')
    expect(result.output).toBe('SELECT id, name FROM users')
  })

  it('returns an error, not a throw, on unparseable input', () => {
    expect(() => formatSql('select ( from', base)).not.toThrow()
    const result = formatSql('select ( from', base)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.length).toBeGreaterThan(0)
    expect(result.error).not.toContain('\n') // headline only, not the grammar dump
  })

  it('respects the requested indent width', () => {
    const two = formatSql('select id from users where active = 1', { ...base, indentWidth: 2 })
    const four = formatSql('select id from users where active = 1', { ...base, indentWidth: 4 })
    if (!two.ok || !four.ok) throw new Error('expected success')
    expect(two.output).toContain('\n  id')
    expect(four.output).toContain('\n    id')
  })

  it('adds blank lines between queries per linesBetweenQueries', () => {
    const result = formatSql('select 1; select 2;', { ...base, linesBetweenQueries: 2 })
    if (!result.ok) throw new Error('expected success')
    expect(result.output).toContain('\n\n\n')
  })

  it('formats successfully for every listed dialect', () => {
    for (const { value } of DIALECTS) {
      const result = formatSql('select 1', { ...base, dialect: value })
      expect(result.ok, `dialect "${value}" failed to format`).toBe(true)
    }
  })
})

describe('isSqlDialect', () => {
  it('accepts every listed dialect value', () => {
    for (const { value } of DIALECTS) expect(isSqlDialect(value)).toBe(true)
  })

  it('rejects an arbitrary string', () => {
    expect(isSqlDialect('cobol')).toBe(false)
    expect(isSqlDialect('')).toBe(false)
  })
})
