import { describe, expect, it } from 'vitest'
import {
  MAX_ROWS,
  generateLorem,
  generateRecords,
  makeRng,
  resolveFieldNames,
  toCsv,
  toJson,
  toJsonLines,
  toSqlInserts,
  toTsInterface,
  toTsv,
  type FieldSchema,
} from './generate'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('hello')
    const b = makeRng('hello')
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('diverges for a different seed', () => {
    const a = makeRng('hello')
    const b = makeRng('world')
    expect(a()).not.toBe(b())
  })

  it('produces values in [0, 1)', () => {
    const rng = makeRng('range-check')
    for (let i = 0; i < 200; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('generateLorem', () => {
  it('is reproducible for the same seed and options', () => {
    const opts = { unit: 'sentences' as const, count: 5, seed: 'fixture', startWithLorem: false }
    expect(generateLorem(opts)).toBe(generateLorem(opts))
  })

  it('diverges for a different seed', () => {
    const base = { unit: 'sentences' as const, count: 5, startWithLorem: false }
    expect(generateLorem({ ...base, seed: 'a' })).not.toBe(generateLorem({ ...base, seed: 'b' }))
  })

  it('returns empty string for zero count', () => {
    expect(generateLorem({ unit: 'words', count: 0, seed: 'x', startWithLorem: false })).toBe('')
  })

  it('generates the requested number of words', () => {
    const text = generateLorem({ unit: 'words', count: 8, seed: 'w', startWithLorem: false })
    // trailing "." is punctuation on the last word, not its own token
    expect(text.replace(/\.$/, '').split(' ')).toHaveLength(8)
  })

  it('starts with the classic opener when asked, for words and sentences', () => {
    const words = generateLorem({ unit: 'words', count: 6, seed: 'w', startWithLorem: true })
    expect(words.toLowerCase()).toMatch(/^lorem ipsum dolor sit amet/)

    const sentences = generateLorem({
      unit: 'sentences',
      count: 2,
      seed: 's',
      startWithLorem: true,
    })
    expect(sentences).toMatch(/^Lorem ipsum dolor sit amet,/)
  })

  it('produces the requested number of paragraphs, blank-line separated', () => {
    const text = generateLorem({ unit: 'paragraphs', count: 3, seed: 'p', startWithLorem: false })
    expect(text.split('\n\n')).toHaveLength(3)
  })

  it('produces the requested number of list items, one per line', () => {
    const text = generateLorem({ unit: 'listItems', count: 4, seed: 'l', startWithLorem: false })
    const lines = text.split('\n')
    expect(lines).toHaveLength(4)
    for (const line of lines) expect(line.startsWith('- ')).toBe(true)
  })

  it('produces text of exactly the requested byte length', () => {
    const text = generateLorem({ unit: 'bytes', count: 137, seed: 'b', startWithLorem: false })
    expect(new TextEncoder().encode(text).length).toBe(137)
  })
})

describe('generateRecords', () => {
  const fields: FieldSchema[] = [
    { name: 'id', type: 'autoIncrement' },
    { name: 'name', type: 'fullName' },
    { name: 'age', type: 'integer', min: 18, max: 65 },
  ]

  it('is reproducible for the same seed', () => {
    const a = generateRecords(fields, 20, 'seed-1')
    const b = generateRecords(fields, 20, 'seed-1')
    expect(a).toEqual(b)
  })

  it('diverges for a different seed', () => {
    const a = generateRecords(fields, 20, 'seed-1')
    const b = generateRecords(fields, 20, 'seed-2')
    expect(a).not.toEqual(b)
  })

  it('generates the requested row count', () => {
    expect(generateRecords(fields, 10, 's')).toHaveLength(10)
  })

  it('caps at MAX_ROWS even when more are requested', () => {
    expect(generateRecords(fields, MAX_ROWS + 500, 's')).toHaveLength(MAX_ROWS)
  })

  it('respects integer min/max bounds', () => {
    const rows = generateRecords(fields, 100, 'bounds')
    for (const row of rows) {
      const age = row.age as number
      expect(age).toBeGreaterThanOrEqual(18)
      expect(age).toBeLessThanOrEqual(65)
    }
  })

  it('auto-increments starting from `min` (default 1)', () => {
    const rows = generateRecords(fields, 5, 's')
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('picks enum values only from the supplied list', () => {
    const enumFields: FieldSchema[] = [
      { name: 'status', type: 'enum', enumValues: 'active, pending, closed' },
    ]
    const rows = generateRecords(enumFields, 30, 'e')
    for (const row of rows) expect(['active', 'pending', 'closed']).toContain(row.status)
  })
})

describe('resolveFieldNames', () => {
  it('fills in a blank name positionally', () => {
    const resolved = resolveFieldNames([
      { name: '', type: 'integer' },
      { name: 'x', type: 'integer' },
    ])
    expect(resolved.map((f) => f.name)).toEqual(['field1', 'x'])
  })

  it('de-duplicates repeated names', () => {
    const resolved = resolveFieldNames([
      { name: 'id', type: 'integer' },
      { name: 'id', type: 'integer' },
      { name: 'id', type: 'integer' },
    ])
    expect(resolved.map((f) => f.name)).toEqual(['id', 'id_2', 'id_3'])
  })
})

describe('exporters', () => {
  const fields: FieldSchema[] = [
    { name: 'name', type: 'fullName' },
    { name: 'note', type: 'sentence' },
  ]
  const rows = [
    { name: 'Ada Lovelace', note: 'Contains, a comma and "quotes".' },
    { name: "O'Brien", note: 'Plain text' },
  ]

  it('produces valid JSON round-tripping the rows', () => {
    expect(JSON.parse(toJson(rows))).toEqual(rows)
  })

  it('produces one JSON object per line', () => {
    const lines = toJsonLines(rows).split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toEqual(rows[0])
  })

  it('quotes CSV fields containing the delimiter or quotes', () => {
    const csv = toCsv(rows, fields)
    const [header, firstDataLine] = csv.split('\n')
    expect(header).toBe('name,note')
    expect(firstDataLine).toBe('Ada Lovelace,"Contains, a comma and ""quotes""."')
  })

  it('uses a tab delimiter for TSV and leaves a bare comma unquoted', () => {
    const tsv = toTsv([{ name: 'Smith, Jane', note: 'no special chars' }], fields)
    expect(tsv.split('\n')).toEqual(['name\tnote', 'Smith, Jane\tno special chars'])
  })

  it('escapes a single quote in a SQL string literal by doubling it', () => {
    const sql = toSqlInserts(rows, fields, 'people')
    expect(sql).toContain("'O''Brien'")
    expect(sql.split('\n')).toHaveLength(2)
    expect(sql).toMatch(/^INSERT INTO people \(name, note\) VALUES/)
  })

  it('falls back to a safe table name for an unsafe identifier', () => {
    const sql = toSqlInserts(rows, fields, 'people; DROP TABLE users; --')
    expect(sql).toMatch(/^INSERT INTO test_data /)
  })

  it('generates a matching TypeScript interface', () => {
    const schema: FieldSchema[] = [
      { name: 'id', type: 'autoIncrement' },
      { name: 'active', type: 'boolean' },
      { name: 'label', type: 'sentence' },
    ]
    const ts = toTsInterface(schema, 'Row')
    expect(ts).toBe('interface Row {\n  id: number\n  active: boolean\n  label: string\n}')
  })
})

describe('field names that are special to JavaScript objects', () => {
  it('treats __proto__ as an ordinary column rather than a prototype write', () => {
    const rows = generateRecords(
      [
        { name: '__proto__', type: 'integer', min: 1, max: 9 },
        { name: 'constructor', type: 'boolean' },
      ],
      2,
      'seed',
    )
    for (const row of rows) {
      // The name must be an own, enumerable key that the exporters will emit.
      expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true)
      expect(Object.keys(row)).toEqual(['__proto__', 'constructor'])
      // And the row's actual prototype must be untouched by the write.
      expect(Object.getPrototypeOf(row)).toBe(Object.prototype)
      expect(JSON.parse(JSON.stringify(row))).toHaveProperty(['__proto__'])
    }
  })
})
