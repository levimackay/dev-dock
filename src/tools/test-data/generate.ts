/**
 * Deterministic fake data: lorem ipsum and schema-driven fake records.
 *
 * Everything here is seeded. `Math.random()` is the wrong tool for test data
 * even though nothing here is security-sensitive: the whole point of test
 * data is that a test using it is reproducible. A failing test that
 * regenerates *different* fixture data on the next run is not a failing
 * test — it is a coin flip wearing a test's clothes. Two people (or two CI
 * runs) typing the same seed must get byte-identical output, which
 * `Math.random()` cannot promise and a seeded PRNG can.
 *
 * The PRNG is mulberry32 (about 8 lines): fast, good-enough statistical
 * quality for filler data, and small enough to read in one sitting rather
 * than trust. It is seeded from an arbitrary string via xmur3, a simple
 * string hash, so the seed field in the UI can be "42" or "release-candidate"
 * or anything else someone wants to type.
 */

// --------------------------------------------------------------- the PRNG

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

/** Turns any string into a reproducible `[0,1)` generator. */
export function makeRng(seed: string): Rng {
  return mulberry32(xmur3(seed)())
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  // arr is always non-empty in this file's own call sites; the fallback is
  // only here to satisfy noUncheckedIndexedAccess without an unsafe `!`.
  return arr[Math.floor(rng() * arr.length)] ?? arr[0]!
}

function randInt(rng: Rng, min: number, max: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return Math.floor(rng() * (hi - lo + 1)) + lo
}

function randFloat(rng: Rng, min: number, max: number, decimals: number): number {
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  const value = rng() * (hi - lo) + lo
  const factor = 10 ** Math.max(0, decimals)
  return Math.round(value * factor) / factor
}

function hexDigit(rng: Rng): string {
  return Math.floor(rng() * 16).toString(16)
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

// ----------------------------------------------------------- word corpora
//
// Small, obviously-fake corpora on purpose: this is filler data for a UI
// mockup or a test fixture, not a synthetic-population tool, and a few dozen
// entries repeated across rows is *more* honest about that than a few
// thousand would be — nobody should ever mistake this output for a real
// person or a real business.

const FIRST_NAMES = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'William',
  'Elizabeth',
  'David',
  'Barbara',
  'Richard',
  'Susan',
  'Joseph',
  'Jessica',
  'Thomas',
  'Sarah',
  'Charles',
  'Karen',
  'Christopher',
  'Nancy',
  'Daniel',
  'Lisa',
  'Matthew',
  'Margaret',
  'Anthony',
  'Betty',
  'Mark',
  'Sandra',
  'Donald',
  'Ashley',
  'Steven',
  'Kimberly',
  'Paul',
  'Emily',
  'Andrew',
  'Donna',
  'Joshua',
  'Michelle',
  'Kenneth',
  'Carol',
  'Kevin',
  'Amanda',
  'Brian',
  'Melissa',
  'George',
  'Deborah',
  'Edward',
  'Stephanie',
  'Ronald',
  'Rebecca',
  'Timothy',
  'Sharon',
  'Jason',
  'Laura',
  'Jeffrey',
  'Cynthia',
  'Ryan',
  'Kathleen',
]

const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
  'Nelson',
  'Baker',
  'Hall',
  'Rivera',
  'Campbell',
  'Mitchell',
  'Carter',
  'Roberts',
  'Gomez',
  'Phillips',
  'Evans',
  'Turner',
  'Diaz',
  'Parker',
  'Cruz',
  'Edwards',
  'Collins',
  'Reyes',
]

const CITIES = [
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia',
  'San Antonio',
  'San Diego',
  'Dallas',
  'Austin',
  'Jacksonville',
  'Fort Worth',
  'Columbus',
  'Charlotte',
  'San Francisco',
  'Indianapolis',
  'Seattle',
  'Denver',
  'Washington',
  'Boston',
  'Nashville',
  'Portland',
  'Las Vegas',
  'Detroit',
  'Memphis',
  'Louisville',
  'Baltimore',
  'Milwaukee',
  'Albuquerque',
  'Tucson',
  'Fresno',
  'Sacramento',
  'Kansas City',
  'Mesa',
  'Atlanta',
  'Omaha',
  'Colorado Springs',
  'Raleigh',
  'Miami',
  'Oakland',
  'Minneapolis',
  'Tulsa',
  'Cleveland',
  'Wichita',
  'Arlington',
  'New Orleans',
  'Bakersfield',
  'Tampa',
  'Honolulu',
  'Aurora',
  'Anaheim',
  'Santa Ana',
  'St. Louis',
  'Riverside',
  'Corpus Christi',
  'Lexington',
  'Pittsburgh',
  'Anchorage',
  'Stockton',
  'Cincinnati',
]

const COMPANIES = [
  'Brightwell Systems',
  'Norwood & Co',
  'Cedar Ridge Logistics',
  'Bluepeak Analytics',
  'Ironvale Manufacturing',
  'Sunridge Digital',
  'Fieldstone Partners',
  'Nova Harbor Group',
  'Rivermark Holdings',
  'Greenfield Robotics',
  'Silverline Media',
  'Oakhaven Consulting',
  'Crestview Technologies',
  'Amberwood Foods',
  'Northgate Logistics',
  'Bluefin Software',
  'Redstone Ventures',
  'Maplecrest Industries',
  'Westbrook Analytics',
  'Clearwater Systems',
  'Pinehill Design',
  'Stonebridge Capital',
  'Lighthouse Robotics',
  'Meridian Freight',
  'Cobalt Works',
  'Larkspur Media',
  'Hollow Creek Foods',
  'Granite Peak Energy',
  'Brightbridge Health',
  'Eastwind Logistics',
  'Vanguard Fabrication',
  'Willowmere Studios',
  'Fernwood Analytics',
  'Copperline Industries',
  'Harbor & Vine',
  'Timberline Software',
  'Ashgrove Partners',
  'Quillfeather Media',
  'Driftwood Digital',
  'Marlowe & Finch',
]

const STREET_NAMES = [
  'Maple',
  'Oak',
  'Cedar',
  'Elm',
  'Pine',
  'Birch',
  'Willow',
  'Chestnut',
  'Walnut',
  'Spruce',
  'Magnolia',
  'Sycamore',
  'Aspen',
  'Poplar',
  'Hickory',
  'Laurel',
  'Cypress',
  'Dogwood',
  'Juniper',
  'Linden',
  'Alder',
  'Beech',
  'Fir',
  'Hazel',
  'Holly',
  'Ivy',
  'Larch',
  'Locust',
  'Myrtle',
  'Olive',
  'Redwood',
  'Rosewood',
  'Sequoia',
  'Sumac',
  'Teak',
  'Woodland',
  'Ridge',
  'Highland',
  'Meadow',
  'Orchard',
]

const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Ct', 'Rd', 'Way', 'Pl', 'Ter']

const STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
]

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'Norway',
  'Australia',
  'New Zealand',
  'Japan',
  'South Korea',
  'Brazil',
  'Mexico',
  'India',
  'Singapore',
  'Ireland',
  'Portugal',
]

const JOB_LEVELS = ['', 'Junior', 'Senior', 'Lead', 'Principal', 'Staff']
const JOB_DOMAINS = [
  'Software',
  'Product',
  'Marketing',
  'Sales',
  'Operations',
  'Data',
  'Support',
  'Finance',
  'People',
  'Design',
]
const JOB_ROLES = [
  'Engineer',
  'Designer',
  'Analyst',
  'Manager',
  'Accountant',
  'Consultant',
  'Technician',
  'Coordinator',
  'Specialist',
  'Director',
]

// RFC 2606 reserved domains — deliberately non-deliverable, so a fake email
// generated here can never land in a real inbox by accident.
const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'mail.example']

const LOREM_WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'non',
  'proident',
  'sunt',
  'culpa',
  'qui',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'id',
  'est',
  'laborum',
]

// -------------------------------------------------------------- lorem mode

export type LoremUnit = 'words' | 'sentences' | 'paragraphs' | 'listItems' | 'bytes'

export interface LoremOptions {
  unit: LoremUnit
  count: number
  seed: string
  startWithLorem: boolean
}

function loremWords(rng: Rng, n: number): string[] {
  return Array.from({ length: n }, () => pick(rng, LOREM_WORDS))
}

function loremSentence(rng: Rng): string {
  return `${capitalize(loremWords(rng, randInt(rng, 5, 14)).join(' '))}.`
}

function loremParagraph(rng: Rng): string {
  return Array.from({ length: randInt(rng, 3, 7) }, () => loremSentence(rng)).join(' ')
}

const LOREM_OPENER_SENTENCE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
const LOREM_OPENER_WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']

export function generateLorem(opts: LoremOptions): string {
  const rng = makeRng(opts.seed)
  const count = Math.max(0, Math.floor(opts.count))
  if (count === 0) return ''

  switch (opts.unit) {
    case 'words': {
      const words = loremWords(rng, count)
      if (opts.startWithLorem) {
        for (let i = 0; i < Math.min(LOREM_OPENER_WORDS.length, count); i++)
          words[i] = LOREM_OPENER_WORDS[i]!
      }
      return capitalize(words.join(' ')) + '.'
    }
    case 'sentences': {
      const sentences = Array.from({ length: count }, () => loremSentence(rng))
      if (opts.startWithLorem) sentences[0] = LOREM_OPENER_SENTENCE
      return sentences.join(' ')
    }
    case 'paragraphs': {
      const paragraphs = Array.from({ length: count }, () => loremParagraph(rng))
      if (opts.startWithLorem) paragraphs[0] = `${LOREM_OPENER_SENTENCE} ${paragraphs[0]}`
      return paragraphs.join('\n\n')
    }
    case 'listItems': {
      const items = Array.from({ length: count }, () =>
        capitalize(loremWords(rng, randInt(rng, 3, 8)).join(' ')),
      )
      if (opts.startWithLorem) items[0] = 'Lorem ipsum dolor sit amet'
      return items.map((item) => `- ${item}`).join('\n')
    }
    case 'bytes': {
      // Lorem text here is pure ASCII, so character count and UTF-8 byte
      // count are the same number — a plain `.slice` is an exact byte
      // truncation, not an approximation that risks cutting a multi-byte
      // character in half.
      let text = opts.startWithLorem ? `${LOREM_OPENER_SENTENCE} ` : ''
      while (text.length < count) text += `${loremSentence(rng)} `
      return text.slice(0, count)
    }
  }
}

// ------------------------------------------------------------ records mode

export type FieldType =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'username'
  | 'phone'
  | 'street'
  | 'city'
  | 'state'
  | 'postcode'
  | 'country'
  | 'company'
  | 'jobTitle'
  | 'sentence'
  | 'paragraph'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'ipAddress'
  | 'url'
  | 'hexColor'
  | 'enum'
  | 'autoIncrement'

export interface FieldSchema {
  name: string
  type: FieldType
  min?: number
  max?: number
  decimals?: number
  /** ISO date strings, "date"/"datetime" only. */
  dateStart?: string
  dateEnd?: string
  /** Comma-separated, "enum" only. */
  enumValues?: string
}

export type RecordValue = string | number | boolean
export type DataRecord = Record<string, RecordValue>

/** Keeps the tab responsive and the output readable — stated in the UI. */
export const MAX_ROWS = 5000

/** Fills in blank field names and de-duplicates repeats, once, so every
 *  format writer and the generator itself agree on the same column names. */
export function resolveFieldNames(fields: FieldSchema[]): FieldSchema[] {
  const seen = new Map<string, number>()
  return fields.map((f, i) => {
    let name = f.name.trim() || `field${i + 1}`
    const priorCount = seen.get(name) ?? 0
    seen.set(name, priorCount + 1)
    if (priorCount > 0) name = `${name}_${priorCount + 1}`
    return { ...f, name }
  })
}

function fakeUuid(rng: Rng): string {
  const seg = (n: number) => Array.from({ length: n }, () => hexDigit(rng)).join('')
  const variant = (8 + Math.floor(rng() * 4)).toString(16) // one of 8, 9, a, b — RFC 4122 variant bits
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${variant}${seg(3)}-${seg(12)}`
}

function randomDate(rng: Rng, startIso: string | undefined, endIso: string | undefined): Date {
  const parsedStart = Date.parse(startIso ?? '2000-01-01')
  const start = Number.isFinite(parsedStart) ? parsedStart : Date.parse('2000-01-01')
  const parsedEnd = Date.parse(endIso ?? new Date().toISOString())
  const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start + 86_400_000
  return new Date(start + rng() * (end - start))
}

function generateValue(rng: Rng, field: FieldSchema, rowIndex: number): RecordValue {
  switch (field.type) {
    case 'firstName':
      return pick(rng, FIRST_NAMES)
    case 'lastName':
      return pick(rng, LAST_NAMES)
    case 'fullName':
      return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`
    case 'email': {
      const first = pick(rng, FIRST_NAMES).toLowerCase()
      const last = pick(rng, LAST_NAMES).toLowerCase()
      return `${first}.${last}${randInt(rng, 1, 99)}@${pick(rng, EMAIL_DOMAINS)}`
    }
    case 'username':
      return `${pick(rng, FIRST_NAMES)[0]!.toLowerCase()}${pick(rng, LAST_NAMES).toLowerCase()}${randInt(rng, 1, 999)}`
    case 'phone':
      return `(${randInt(rng, 200, 999)}) ${randInt(rng, 200, 999)}-${String(randInt(rng, 0, 9999)).padStart(4, '0')}`
    case 'street':
      return `${randInt(rng, 100, 9999)} ${pick(rng, STREET_NAMES)} ${pick(rng, STREET_TYPES)}`
    case 'city':
      return pick(rng, CITIES)
    case 'state':
      return pick(rng, STATES)
    case 'postcode':
      return String(randInt(rng, 10000, 99999))
    case 'country':
      return pick(rng, COUNTRIES)
    case 'company':
      return pick(rng, COMPANIES)
    case 'jobTitle':
      return [pick(rng, JOB_LEVELS), pick(rng, JOB_DOMAINS), pick(rng, JOB_ROLES)]
        .filter(Boolean)
        .join(' ')
    case 'sentence':
      return loremSentence(rng)
    case 'paragraph':
      return loremParagraph(rng)
    case 'integer':
      return randInt(rng, field.min ?? 0, field.max ?? 1000)
    case 'decimal':
      return randFloat(rng, field.min ?? 0, field.max ?? 1000, field.decimals ?? 2)
    case 'boolean':
      return rng() < 0.5
    case 'date':
      return randomDate(rng, field.dateStart, field.dateEnd).toISOString().slice(0, 10)
    case 'datetime':
      return randomDate(rng, field.dateStart, field.dateEnd).toISOString()
    case 'uuid':
      return fakeUuid(rng)
    case 'ipAddress':
      return `${randInt(rng, 1, 223)}.${randInt(rng, 0, 255)}.${randInt(rng, 0, 255)}.${randInt(rng, 1, 254)}`
    case 'url':
      return `https://${pick(rng, LOREM_WORDS)}.example.com/${pick(rng, LOREM_WORDS)}-${randInt(rng, 1, 999)}`
    case 'hexColor':
      return `#${Array.from({ length: 6 }, () => hexDigit(rng)).join('')}`
    case 'enum': {
      const options = (field.enumValues ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      return options.length > 0 ? pick(rng, options) : ''
    }
    case 'autoIncrement':
      return rowIndex + (field.min ?? 1)
  }
}

export function generateRecords(fields: FieldSchema[], count: number, seed: string): DataRecord[] {
  const resolved = resolveFieldNames(fields)
  const rng = makeRng(seed)
  const n = Math.max(0, Math.min(MAX_ROWS, Math.floor(count)))
  const rows: DataRecord[] = []
  for (let i = 0; i < n; i++) {
    const row: DataRecord = {}
    for (const field of resolved) row[field.name] = generateValue(rng, field, i)
    rows.push(row)
  }
  return rows
}

// --------------------------------------------------------------- exporters

export function toJson(rows: DataRecord[]): string {
  return JSON.stringify(rows, null, 2)
}

export function toJsonLines(rows: DataRecord[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n')
}

function delimitedEscape(value: RecordValue, delimiter: string): string {
  const s = String(value)
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toDelimited(rows: DataRecord[], fields: FieldSchema[], delimiter: string): string {
  const resolved = resolveFieldNames(fields)
  if (resolved.length === 0) return ''
  const header = resolved.map((f) => delimitedEscape(f.name, delimiter)).join(delimiter)
  const lines = rows.map((row) =>
    resolved.map((f) => delimitedEscape(row[f.name] ?? '', delimiter)).join(delimiter),
  )
  return [header, ...lines].join('\n')
}

export function toCsv(rows: DataRecord[], fields: FieldSchema[]): string {
  return toDelimited(rows, fields, ',')
}

export function toTsv(rows: DataRecord[], fields: FieldSchema[]): string {
  return toDelimited(rows, fields, '\t')
}

function sqlLiteral(value: RecordValue): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return `'${value.replace(/'/g, "''")}'`
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export function toSqlInserts(rows: DataRecord[], fields: FieldSchema[], tableName: string): string {
  const resolved = resolveFieldNames(fields)
  const table = SAFE_IDENTIFIER.test(tableName.trim()) ? tableName.trim() : 'test_data'
  if (resolved.length === 0) return ''
  const columns = resolved.map((f) => f.name).join(', ')
  return rows
    .map(
      (row) =>
        `INSERT INTO ${table} (${columns}) VALUES (${resolved.map((f) => sqlLiteral(row[f.name] ?? '')).join(', ')});`,
    )
    .join('\n')
}

function tsPropertyType(type: FieldType): string {
  switch (type) {
    case 'integer':
    case 'decimal':
    case 'autoIncrement':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'string'
  }
}

function tsPropertyName(name: string): string {
  return SAFE_IDENTIFIER.test(name) ? name : JSON.stringify(name)
}

export function toTsInterface(fields: FieldSchema[], interfaceName: string): string {
  const resolved = resolveFieldNames(fields)
  const name = SAFE_IDENTIFIER.test(interfaceName.trim()) ? interfaceName.trim() : 'Record'
  const lines = resolved.map((f) => `  ${tsPropertyName(f.name)}: ${tsPropertyType(f.type)}`)
  return `interface ${name} {\n${lines.join('\n')}\n}`
}
