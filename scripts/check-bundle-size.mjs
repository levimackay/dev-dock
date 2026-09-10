/**
 * Fails the build when the initial download grows past its budget.
 *
 * The point of this project is that it is small. Without a gate, "small" decays
 * one convenient dependency at a time and nobody notices until the app is a
 * megabyte. A number in CI turns that into a conversation at the moment it
 * happens, which is the only moment anyone is willing to have it.
 *
 * The budget covers the *initial* load only: the shell, React, and the shared
 * stylesheet. Per-tool chunks are checked against a looser per-file ceiling,
 * because a tool nobody opened costs nothing.
 */
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/assets'

// Gzipped kilobytes.
const BUDGET_INITIAL_KB = 130
const BUDGET_PER_TOOL_KB = 100

const gzipKb = (path) => gzipSync(readFileSync(path)).length / 1024

let files
try {
  files = readdirSync(DIST)
} catch {
  console.error(`No build output at ${DIST}. Run \`pnpm build\` first.`)
  process.exit(1)
}

// The entry chunk and the vendor chunk it always pulls in, plus every CSS file
// the entry references. Vite hashes names, so they are matched by prefix.
const initial = files.filter(
  (name) =>
    (name.startsWith('index-') && (name.endsWith('.js') || name.endsWith('.css'))) ||
    (name.startsWith('react-') && name.endsWith('.js')),
)

if (initial.length === 0) {
  console.error('Could not find an entry chunk. Did the build output change shape?')
  process.exit(1)
}

const initialKb = initial.reduce((sum, name) => sum + gzipKb(join(DIST, name)), 0)

const tools = files
  .filter((name) => name.endsWith('.js') && !initial.includes(name))
  .map((name) => ({ name, kb: gzipKb(join(DIST, name)) }))
  .sort((a, b) => b.kb - a.kb)

const rawTotalKb = files.reduce((sum, name) => sum + statSync(join(DIST, name)).size, 0) / 1024

const fmt = (kb) => `${kb.toFixed(1)} KB`

console.log('Initial download (gzipped)')
for (const name of initial.sort()) console.log(`  ${fmt(gzipKb(join(DIST, name))).padStart(9)}  ${name}`)
console.log(`  ${fmt(initialKb).padStart(9)}  total — budget ${BUDGET_INITIAL_KB} KB\n`)

console.log('Largest lazy chunks (gzipped)')
for (const { name, kb } of tools.slice(0, 5)) console.log(`  ${fmt(kb).padStart(9)}  ${name}`)
console.log(`\nAll assets, uncompressed: ${fmt(rawTotalKb)}`)

const failures = []
if (initialKb > BUDGET_INITIAL_KB) {
  failures.push(`Initial download is ${fmt(initialKb)}, over the ${BUDGET_INITIAL_KB} KB budget.`)
}
for (const { name, kb } of tools) {
  if (kb > BUDGET_PER_TOOL_KB) {
    failures.push(`${name} is ${fmt(kb)}, over the ${BUDGET_PER_TOOL_KB} KB per-chunk budget.`)
  }
}

if (failures.length > 0) {
  console.error(`\nBundle size check failed:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '\nEither remove weight, or raise the budget in scripts/check-bundle-size.mjs and say why in the pull request.',
  )
  process.exit(1)
}

console.log('\nBundle size within budget.')
