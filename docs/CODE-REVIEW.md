# Code review

Senior-engineer review of the repository as it stands, not a diff review.
Method: read `docs/ARCHITECTURE.md`, `docs/TOOL-AUTHORING.md`, `SECURITY.md`,
`README.md`, `PROGRESS.md`, `docs/SECURITY-AUDIT.md`, then the code. Every
finding below was confirmed by reading the lines and, where a runtime claim is
made, by executing the actual module. `npx vitest run` (743 passed, 36 files),
`npx tsc -b` (clean), `npx eslint .` (0 errors, 4 react-refresh warnings) all
pass on the tree as reviewed.

Confidence is stated per finding. "Confirmed" means I ran it.

**Reviewed at `e74ec83`.** Two commits landed while this review was in progress
— `0bcd46a` (Sample buttons for Base64 and Unix Timestamp) and `e74ec83`
(dead-export removal). Line numbers below are against `e74ec83`. Findings those
two commits already resolved are marked **FIXED** in place rather than deleted,
so the trail is legible.

---

## A. Correctness bugs

Ranked by blast radius.

### A1. `toUnifiedDiff` produces patches that `git apply` rejects — CRITICAL, confirmed

> **Status: being fixed in the working tree as this review was written.** I
> re-tested the uncommitted version against a real `git apply --check`: the
> three defects below are genuinely closed. **One residual defect remains —
> see §A1b, which is new and was introduced by the fix.**

`src/lib/diff.ts:306-351` (as reviewed at `e74ec83`). The docstring said:

> Renders a unified diff with the given amount of context, the format `patch`
> and `git apply` read.

It does not. Two independent defects, and between them they cover essentially
every real file.

**Defect 1 — the phantom trailing line.** `splitLines` (`src/lib/diff.ts:191-194`)
splits `"a\nb\nc\n"` into `['a','b','c','']`, so a 3-line file is modelled as 4
lines. The hunk header and the body inherit that:

```
$ toUnifiedDiff('a\nb\nc\n', 'a\nb\nX\nc\n')
--- a
+++ b
@@ -1,4 +1,5 @@
 a
 b
+X
 c
<space>          ← context line for the phantom empty 4th line
```

Real `diff -u` on the same pair emits `@@ -1,3 +1,4 @@` and stops after ` c`.

**Defect 2 — no trailing newline.** Line 350 is `return out.join('\n')`. A
unified diff must end with a newline. `git apply` reports `corrupt patch at
line 8` before it even evaluates the content.

**Defect 3 — no `\ No newline at end of file`.** For input *without* a trailing
newline the body is byte-identical to `diff -u`'s, but the missing marker means
git believes the file ends in `\n` and the context does not match.

Reproduced against a real repo:

```
file with trailing newline    → error: corrupt patch at line 8
  (+ trailing \n added)       → error: patch does not apply
file without trailing newline → error: patch does not apply
```

This is the headline output of `code-diff`: `CodeDiffTool.tsx:152` ("Copy
patch") and `:158-166` ("Download .patch") both feed from
`toUnifiedDiff` at `:83`. The tool's most-advertised feature emits a file that
does not do the one thing its extension promises.

**Fix.** Three parts:
1. Model the trailing newline explicitly. Either strip one trailing `''` in
   `diffLines` and carry a `noEol` flag per side, or have `toUnifiedDiff`
   detect `text.endsWith('\n')` and drop the phantom last line from both the
   count and the body.
2. Append `'\n'` to the return value.
3. Emit `\ No newline at end of file` after the last line of a side that lacks
   one.

Add a test that shells out to `git apply --check` (or at minimum asserts the
exact byte output against `diff -u` for the four combinations of
trailing-newline presence). The current tests assert the shape of the string,
not that it is a valid patch — see §B22.

**Verified against the working-tree fix:**

```
a\nb\nc\n   → a\nb\nX\nc\n     @@ -1,3 +1,4 @@              git apply: OK
a\nb\nc     → a\nb\nX\nc        + \ No newline at end of file  git apply: OK
```

Both correct, marker correctly placed, patch newline-terminated. Also spot-checked
append-at-end, delete-at-end, empty→text (`@@ -0,0 +1,2 @@`), text→empty
(`@@ -1,2 +0,0 @@`) and identical-input (empty string): all correct.

### A1b. The fix emits a headers-only patch when only the trailing newline changed — NEW, confirmed

Introduced by the A1 fix. In the working-tree version:

```ts
const leftBody  = leftEndsWithEol  && left  !== '' ? left.slice(0, -1)  : left
const rightBody = rightEndsWithEol && right !== '' ? right.slice(0, -1) : right
const { lines } = diffLines(leftBody, rightBody, options)

if (lines.every((line) => line.op === 'equal') && leftEndsWithEol === rightEndsWithEol) return ''
```

When the *only* difference is the trailing newline, the two bodies are
identical, so `lines.every(equal)` is true — but the second clause is false, so
the early return is skipped. Execution falls through, `changedAt` is all
`false`, zero hunks are built, and the function returns just the two file
headers:

```
toUnifiedDiff('a\nb\nc', 'a\nb\nc\n')  →  "--- a\n+++ b\n"
```

`diff -u` on the same pair produces a real hunk:

```
@@ -1,3 +1,3 @@
 a
 b
-c
\ No newline at end of file
+c
```

So "someone added/removed the final newline" — a real change, and one people
specifically open a diff tool to see — renders as a patch with no hunks.

**Second-order inconsistency:** `code-diff` builds its side-by-side view from a
*separate* `diffLines` call on the **unstripped** text
(`CodeDiffTool.tsx:83` region), and that call does see the change:

```
diffLines('a\nb\nc', 'a\nb\nc\n')
→ ["equal:\"a\"", "equal:\"b\"", "equal:\"c\"", "insert:\"\""]
```

The two halves of the same screen now disagree about whether anything changed:
the panes show an inserted line, the patch shows nothing.

**Fix.** When the bodies are equal but the EOL flags differ, emit a hunk that
replaces the last line with itself, carrying the marker on whichever side lacks
the newline — which is exactly what `diff -u` does. Concretely: treat
`leftEndsWithEol !== rightEndsWithEol` as making the final line "changed" so it
enters `changedAt`, rather than only gating the early return on it.

**Test to add:** the four EOL combinations as a table, each asserted byte-for-byte
against `diff -u`'s output. `'a\nb\nc'` vs `'a\nb\nc\n'` is the case that would
have caught both A1 and A1b.

### A2. `decodeJwt` throws a `TypeError` on a `null` header — confirmed

`src/tools/jwt-decoder/jwt.ts:160`:

```ts
const algNone = typeof header.alg === 'string' && header.alg.toLowerCase() === 'none'
```

`header` comes from `JSON.parse(headerRaw) as JwtHeader` at `:125`. `"null"` is
valid JSON, so `header` can be `null`, and `null.alg` throws.

**Input:** paste `bnVsbA.e30.x`. `bnVsbA` is base64url for `null`, passes
`B64URL_RE` (`:70`), decodes as UTF-8, parses as JSON. Line 160 throws
`TypeError: Cannot read properties of null` inside the tool's `useMemo`, i.e.
straight into the render path. `ToolErrorBoundary` catches it and the tool
blanks out.

This directly violates TOOL-AUTHORING rule 3 and SECURITY.md's "No tool is
permitted to throw into the render path."

**Fix.** `const alg = isRecord(header) ? header.alg : undefined`. Better: make
`decodeJwt` reject a header that is not a JSON object with a proper message
("The header decoded, but is a JSON `null`, not an object"), because a header
that is an array or a number is equally meaningless. Note the UI is already
defensive (`JwtDecoderTool.tsx:73` and `:103` both guard) — only the logic
layer is not.

### A3. `parseFlexible` returns `ok: true` with an Invalid Date, and the render then throws — **FIXED in the working tree**

> Re-verified: `parseFlexible('1700000000000000000', …)` now returns
> `ok: false` with a message naming the ±8.64e15 ms range and pointing at the
> Unix Timestamp tool. The guard is on the epoch branch only, which is correct
> — the ISO branches cannot overflow, because `validateCivilFields` bounds the
> fields and the year regex caps at 9999 (`Date.UTC(9999, 11, 31)` ≈ 2.5e14),
> and the RFC 2822 branch already checks `Number.isNaN`. Original finding below
> for the record.


`src/tools/datetime-converter/datetime.ts:204-213`:

```ts
const ms = digits <= 10 ? value * 1000 : value
return { ok: true, date: new Date(ms), dateOnly: false, format: 'epoch' }
```

No range check. `new Date(1.7e18)` is Invalid Date, and `ok: true` is returned
anyway.

**Input:** paste a nanosecond epoch — `1700000000000000000` — into the DateTime
Converter. `parsed.ok` is true, so `DateTimeConverterTool.tsx:276` calls
`toIso8601(parsed.date)` → `date.toISOString()` → `RangeError: Invalid time
value`, in render. Confirmed by executing the module.

Ironically the comment at `:205-208` anticipates exactly this input ("the
dedicated Unix Timestamp tool covers micro/nanosecond epochs") and then does not
guard against it. `epoch.ts:111-116` gets this right for the same class of
input; `datetime.ts` does not.

**Fix.** After building the date, `if (Number.isNaN(date.getTime())) return
{ ok: false, error: ... }`. Reuse `epoch.ts`'s message, which already explains
the ±8.64e15 ms range — see §D2 on why these two files should share code.

### A4. `durationBetween` emits negative day counts — **FIXED in the working tree**

> Re-verified, including a regression sweep the fix did not have tests for:
>
> ```
> 2026-01-31 → 2026-03-01   0y 0mo 29d      (was 0y 1mo -2d)
> 2026-01-01 → 2027-03-15   1y 2mo 14d      ✓
> 2026-03-31 → 2026-05-01   0y 1mo 0d       ✓
> 2026-01-15 → 2026-02-14   0y 0mo 30d      ✓
> 2026-01-15 → 2026-02-15   0y 1mo 0d       ✓
> 2024-02-29 → 2025-02-28   0y 11mo 30d     ✓ (leap-day convention, not a bug)
> ```
>
> No negative fields and no regressions. Original finding below for the record.


`src/tools/datetime-converter/datetime.ts:420-428`. The borrow is a single `if`,
not a loop, and borrows the length of the month before `end` — which can be
shorter than the deficit.

**Input:** from `2026-01-31T00:00:00Z`, to `2026-03-01T00:00:00Z`. Output:

```
{ years: 0, months: 1, days: -2, hours: 0, ... , negative: false }
```

`days: -2`. The interface comment at `:385` promises the opposite:

> True when `to` is earlier than `from`, **every field above is still
> non-negative.**

The UI renders this straight through (`DateTimeConverterTool.tsx:454-459`), so
the user sees "1 month, -2 days".

**Fix.** Turn the borrow into a `while`, walking back a month at a time, or
compute the day component by anchoring: add `years`/`months` to `start`, clamp
to the month end, then take the plain day difference from there.

### A5. `Date.UTC` maps years 0–99 to 1900–1999 — **FIXED in the working tree, one residual (§A5b)**

> Fixed well: a new `src/lib/utcFromCivil.ts` applied at all 12 call sites in
> both tools, which also resolves the §D2 recommendation to hoist this to
> `src/lib`. Re-verified `0050-03-15`, `0004-02-29`, `0000-01-01`,
> `0099-12-31`: all correct. **One input still wrong — §A5b.** Original
> finding below for the record.


`Date.UTC(50, 2, 15)` is 1950-03-15, not 0050-03-15. This is unguarded in six
places:

- `src/tools/datetime-converter/datetime.ts:126` (`zonedTimeToUtc`)
- `src/tools/datetime-converter/datetime.ts:160`, `:182`, `:187` (the three ISO branches)
- `src/tools/datetime-converter/datetime.ts:302` (`toIsoWeekDate`)
- `src/tools/unix-timestamp/epoch.ts:220` and `:252` (`tzOffsetMs`, `zonedTimeToUtc`)

`ISO_DATE_ONLY` (`datetime.ts:55`) is `/^(\d{4})-(\d{2})-(\d{2})$/`, so `0050`
is accepted input.

**Input:** type `0050-03-15` into the DateTime Converter. Confirmed output:
`1950-03-15T00:00:00.000Z`. Every downstream row (RFC 2822, epoch, week date)
is wrong by 1900 years, with no indication anything was reinterpreted.

The same bug reaches `tzOffsetMs`, whose whole job is to reconstruct an instant
from `Intl`-formatted fields — so for any pre-100 CE instant the computed offset
is off by ~1900 years' worth of milliseconds.

**Fix.** Replace every `Date.UTC(y, ...)` with a helper:

```ts
function utcOf(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) {
  const t = new Date(0)
  t.setUTCFullYear(y, mo, d)
  t.setUTCHours(h, mi, s, ms)
  return t.getTime()
}
```

`setUTCFullYear` has no two-digit special case. One helper, in `src/lib`, shared
by both tools.

### A5b. `utcFromCivil` is off by one day for `0000-02-29` — NEW, confirmed

The working-tree helper (`src/lib/utcFromCivil.ts:26-31`) repairs the year
*after* `Date.UTC` has already resolved the calendar:

```ts
const timestamp = Date.UTC(year, monthIndex, day, hour, minute, second, ms)
if (year >= 100 || year < 0 || Number.isNaN(timestamp)) return timestamp
const date = new Date(timestamp)
date.setUTCFullYear(year)     // ← too late if Date.UTC already rolled over
return date.getTime()
```

`setUTCFullYear` cannot undo a day-rollover that has already happened. Year 0 is
a leap year (divisible by 400); 1900 is not (divisible by 100, not 400). So:

```
Date.UTC(0, 1, 29)  →  1900-02-29 does not exist  →  1900-03-01
setUTCFullYear(0)   →  0000-03-01                  ✗ should be 0000-02-29
```

**Input:** type `0000-02-29` into the DateTime Converter. Confirmed output
`0000-03-01T00:00:00.000Z`. It passes `validateCivilFields`, because
`isLeapYear(0)` correctly returns `true` — so the validator and the constructor
disagree about whether that date exists.

Year 0 is the only affected year: it is the only leap year in 0–99 whose
+1900 counterpart is not one.

**Fix.** Set the year *before* the calendar is resolved, using the three-argument
form:

```ts
export function utcFromCivil(year, monthIndex, day, hour = 0, minute = 0, second = 0, ms = 0): number {
  if (year >= 100 || year < 0) return Date.UTC(year, monthIndex, day, hour, minute, second, ms)
  const d = new Date(0)
  d.setUTCFullYear(year, monthIndex, day)   // all three against the real year
  d.setUTCHours(hour, minute, second, ms)
  return d.getTime()
}
```

Verified against `0000-02-29`, `0004-02-29`, `0050-03-15`, `0000-01-01`,
`0099-12-31`, `0100-02-28`, `2026-03-15`: all correct.

**Test to add:** `0000-02-29` specifically. It is the one input that separates
"repair the year afterwards" from "set the year first", and it is exactly the
kind of case the file's own comment is proud of catching.

### A6. Cron's backwards-range error names the wrong replacement — confirmed

`src/tools/cron-helper/cron.ts:198-202`:

```ts
`… write two items instead, as in ${to}-${spec.max},${spec.min}-${from}.`
```

`from` and `to` are swapped. Confirmed:

```
parseCron('0 22-3 * * *')
→ "The range 22-3 runs backwards. Cron ranges do not wrap; write two items
   instead, as in 3-23,0-22."
```

`3-23,0-22` is every hour of the day. The user asked for 22, 23, 0, 1, 2, 3 and
the tool tells them to write "all hours". Correct advice is
`${from}-${spec.max},${spec.min}-${to}` → `22-23,0-3`.

This is the worst kind of error message: confidently wrong, in the one place a
confused user is guaranteed to be reading.

**Fix.** Swap the two interpolations. Add a test asserting the *content* of the
suggestion, not just that an error was produced.

### A7. `describeCron` silently drops the seconds field — confirmed

`src/tools/cron-helper/cron.ts:487-505`. The "small enough to spell out as clock
times" branch and the fallback branch below it both build their sentence from
`minutes` and `hours` only. `seconds` is consulted exactly once, at `:479`
(`everySecond`) and `:484` (the `everyMinute && everyHour` case).

**Input:** `30 0 9 * * *` (six-field: second 30, minute 0, hour 9).

```
seconds field: [ 30 ]
describe:      "At 09:00."
```

The tool says the job fires at 09:00:00. It fires at 09:00:30. `explainFields`
gets it right (it has a Second row), so the two halves of the same screen
disagree.

**Fix.** In the clock-times branch, render `HH:MM:SS` when `hasSeconds` and the
seconds field is not `[0]`. In the fallback branch, prepend the second
description. Guard with a test per branch.

### A8. Cron silently accepts a malformed range — confirmed

`src/tools/cron-helper/cron.ts:193`: `range.split('-', 2)`. The `2` limit
discards the rest instead of rejecting it.

```
parseCron('0 0 1-2-3 * *') → ok: true, daysOfMonth: [1, 2]
```

`1-2-3` is not cron. The tool schedules something different from what was typed
and says nothing — precisely what TOOL-AUTHORING rule 3 and the file's own
"detected and named rather than silently mis-parsed" philosophy (`cron.ts:24-26`)
exist to prevent.

**Fix.** `const pieces = range.split('-'); if (pieces.length !== 2) return
bad(...)`. Same class: check for a second `/` in `parsePart`.

### A9. `parseHue` cannot parse gradians, and the `grad` branch is unreachable — confirmed

`src/tools/color-converter/color.ts:333-343`:

```ts
else if (text.endsWith('rad')) value = (Number(text.slice(0, -3)) * 180) / Math.PI   // :338
else if (text.endsWith('grad')) value = (Number(text.slice(0, -4)) * 360) / 400      // :339
```

`'100grad'.endsWith('rad')` is `true`, so the `rad` arm wins. It slices off
`rad`, leaving `100g`, `Number('100g')` is `NaN`, `Number.isFinite` fails,
`parseHue` returns `null`, `parseColor` returns `null`.

```
parseColor('hsl(100grad 50% 50%)') → null
parseColor('hsl(90deg 50% 50%)')   → { format: 'hsl', rgb: {…} }   (works)
```

So: line 341 is dead code, and a valid CSS colour is reported as unparseable.

**Fix.** Test `grad` before `rad` (and `turn` before `rad` is already fine since
they do not share a suffix). Order-sensitive suffix dispatch deserves a comment
saying so.

### A10. NanoID length is unbounded from a share link — confirmed

`src/tools/uuid-generator/UuidGeneratorTool.tsx:51` declares
`nanoidLength: 'number'` in the `shapeValidator`. `roll()` at `:96-103` clamps
`count` to `MAX_COUNT` but passes `state.nanoidLength` through untouched. The
UI's `max={128}` (`:155`) is an HTML validity hint, not a clamp, and an inbound
`#s=` payload never passes through the input at all.

Two failure modes:

- `nanoidLength: 100000` → `randomBytes(100000)` →
  `crypto.getRandomValues` throws `QuotaExceededError: The requested length
  exceeds 65,536 bytes` (confirmed). Thrown from a click handler, which React
  error boundaries do **not** catch, so the button silently does nothing.
- Below the quota but large (e.g. 60000 × count 1000) it just builds 60 MB of
  string on the main thread.

TOOL-AUTHORING rule 6 says share state is untrusted; the validator can only
express `'number'`, so it cannot express "in range" — see §C3.

**Fix.** Clamp in `roll()` next to the existing `count` clamp, and chunk
`randomBytes` at 65536 in `ids.ts` so the primitive is safe regardless of
caller. Root-cause fix belongs in `randomBytes` — every generator routes
through it.

### A11. The contrast verdict disagrees with the number displayed next to it — confirmed

`src/tools/color-converter/color.ts:511-521` grades against the unrounded
`ratio`; `ColorConverterTool.tsx:305` displays `verdict.ratio.toFixed(2)`.

Confirmed pairs:

| foreground | background | displayed | badge |
| --- | --- | --- | --- |
| `rgb(15 120 213)` | `#ffffff` | `4.50:1` | AA normal **FAIL** |
| `#959595` | `#ffffff` | `3.00:1` | AA large **FAIL** |

A user reads "4.50:1" — the exact AA threshold — and is told it fails. There is
no way to tell from the screen that the real value is 4.4990.

This is a genuine judgement call, not automatically a bug: WCAG's own
conformance text is usually read as "the computed ratio", so failing 4.4990 is
defensible. What is not defensible is showing a rounded number that contradicts
the badge beside it.

**Fix.** Pick one and say so in a comment. Either display three decimals, or
display `4.49` by flooring rather than rounding (`Math.floor(ratio*100)/100`),
so the number shown can never claim more contrast than was measured. Flooring
is the honest choice for a pass/fail tool.

### A12. `formatRelative` says "60 seconds ago" — confirmed

`src/tools/unix-timestamp/epoch.ts:163-169`. The ladder picks the largest unit
where `abs >= unit.ms`, then rounds. At 59.6 s: `abs >= 1000` (second) but
`abs < 60000` (minute), so the unit is `second` and `Math.round(59.6)` is `60`.

```
formatRelative(t, t + 59_600) → "in 60 seconds"
```

Same at every boundary: 59.6 min → "60 minutes", 23.6 h → "24 hours".

**Fix.** Round first, then re-check: if `count` reaches the next unit's
threshold, promote. Two lines.

### A13. `SplitPane` reads `localStorage` with no validator — confirmed

`src/components/SplitPane.tsx:58`:

```ts
storageKey ? clamp(read(`split:${storageKey}`, defaultRatio), min, max) : defaultRatio
```

`read`'s `isValid` parameter (`src/lib/storage.ts:42`) is optional and is not
supplied. A hand-edited or version-drifted `devdock:split:*` value of `"x"` or
`{}` returns straight out of `read` as a fake `number`, and
`Math.max(0.18, "x")` is `NaN`, producing `--a: NaN%`, which is an invalid
grid track and drops the whole declaration.

`clamp` at `:150-152` does guard with `Number.isFinite` on the *commit* path,
which is why this is low-impact in practice. It is still the one call site that
falsifies SECURITY.md's "every read is validated against an expected shape
before use" — see §B9.

**Fix.** Pass a validator: `read(key, defaultRatio, (v): v is number =>
typeof v === 'number' && Number.isFinite(v))`. Consider making `isValid`
non-optional in `storage.ts` so the doc claim becomes structurally true.

### A14. The inbound share fragment is unbounded — a decompression bomb — confirmed by reading

`src/lib/share.ts:105-127` and `src/app/ToolPage.tsx:103`.

`MAX_SHARE_CHARS = 8000` is checked **only on encode** (`ToolPage.tsx:103`,
outbound). `decodeShareState` accepts a fragment of any length, base64-decodes
it into a `Uint8Array`, and pushes it through
`DecompressionStream('deflate-raw')`. `pipe` (`share.ts:58-88`) accumulates
every chunk into an array with no size ceiling and then allocates one
contiguous buffer of the total.

`deflate` reaches ~1000:1 on repetitive input. A 200 KB URL fragment — well
within what browsers and messaging apps carry — inflates to ~200 MB before
`JSON.parse` even runs. On a phone that is an OOM tab kill.

SECURITY.md's threat model names this attacker explicitly ("whoever sends the
user a link") and its "Bounded work" table has no row for share payloads, even
though the JSON depth cap two paragraphs above was added for exactly this
reason.

**Fix.** Reject `encoded.length > MAX_SHARE_CHARS` at the top of
`decodeShareState`, and cap `total` inside `pipe` (bail past, say, 4 MB
inflated). Add a "Share payload size" row to the SECURITY.md table.

### A15. The regex timeout blames backtracking for what is queueing — confirmed by reading

`src/lib/regexRunner.ts:59-84`. One long-lived worker processes messages
serially, but each request's `setTimeout` starts at `postMessage` time.

**Scenario:** a pattern that legitimately takes 1000 ms is running. The user
types one more character; request N+1 is posted and starts its 1200 ms clock
immediately, but the worker will not begin it for another 1000 ms. If N+1 then
takes 300 ms of its own, its timer fires and the user is told:

> The pattern did not finish within 1200 ms and was stopped. This usually means
> catastrophic backtracking, look for nested quantifiers such as `(a+)+`…

The pattern was fine. The message names the wrong cause, and `killWorker()`
throws away the in-flight work of every other pending request (they are left in
`pending` until their own timers fire).

**Fix.** Have the worker post an `ack` when it dequeues a request and start the
timer from the ack, or serialise at the client so only one request is in flight
and supersede rather than queue (which is what you want anyway for
type-as-you-go: request N is irrelevant the moment N+1 exists).

### A16. `generateNanoId` loops forever for an alphabet longer than 256 characters — confirmed by reading

`src/tools/uuid-generator/ids.ts:120`:

```ts
const limit = 256 - (256 % alphabet.length)
```

For `alphabet.length > 256`, `256 % length` is `256`, so `limit` is `0`, and
`if (byte >= limit) continue` rejects every byte. `while (result.length <
length)` never terminates. The alphabet field
(`UuidGeneratorTool.tsx:180-188`) is a free-text input with no length cap, and
`nanoidAlphabet` is `'string'` in the share validator.

**Fix.** `if (alphabet.length > 256) throw` — or better, clamp the rejection
limit: `const limit = alphabet.length > 256 ? 256 : 256 - (256 % alphabet.length)`
is wrong too (indices above 255 become unreachable, reintroducing bias). The
honest fix is to reject an alphabet over 256 characters with a message, which
also matches the tool's stated bias-avoidance goal.

### A17. `buildRamp(rgb, 1)` produces `#NaNNaNNaN` — latent, confirmed by reading

`src/tools/color-converter/color.ts:579`: `const l = 0.96 - (i / (steps - 1)) * 0.86`.
With `steps === 1` that is `0/0` → `NaN`, which propagates through
`oklchToRgb` → `linearToSrgb` → `clamp(Math.round(NaN))` → `NaN` →
`NaN.toString(16)` → `"NaN"`.

No caller passes `steps` today (the default 9 is always used), so this is
latent. It is listed because it is one line to guard and the function is
exported.

**Fix.** `if (steps < 2) return [...]` or `const denom = Math.max(1, steps - 1)`.

### A18. Cron's `wildcard` flag diverges from Vixie for `*/n` — medium confidence

`src/tools/cron-helper/cron.ts:143`: `const wildcard = text === '*' || text === '?'`.

Vixie cron (and the crontab(5) semantics most people have internalised) sets its
`DOM_STAR`/`DOW_STAR` flags when the field *begins* with `*`, so `*/2` counts as
unrestricted for the either/both rule. Dev Dock counts it as restricted.

**Input:** `0 0 */1 * MON`. Confirmed `daysOfMonth.wildcard === false`, so
`matchesDay` (`:332`) takes the `domMatch || dowMatch` branch and the tool
reports it fires **every day**. Vixie fires only on Mondays.

I have flagged this as medium confidence because "standard cron" is not one
thing and the file explicitly scopes itself to Vixie (`:11`). But the file also
claims the day rule is "isolated in `matchesDay`" and is "the most common bug in
hand-rolled cron code" — which makes getting this exact edge right the whole
point of the module.

**Fix.** `const wildcard = text.startsWith('*') || text.startsWith('?')`, plus a
comment explaining why `*/2` counts as a star. Add the `0 0 */1 * MON` case to
`cron.test.ts`.

### A19. `fromDate` throws on an Invalid Date — latent, confirmed by reading

`src/tools/unix-timestamp/epoch.ts:134`: `BigInt(date.getTime())`. `BigInt(NaN)`
throws `RangeError` (confirmed). No current call site can reach it, because
`toInstant` range-checks first, but the function is exported and takes an
arbitrary `Date`.

**Fix.** Guard, or narrow the parameter with a `ValidDate` branded type.

### Checked and sound

- **`diffSequences` / `myers` / `backtrack`** (`src/lib/diff.ts:51-160`). The
  Myers implementation is correct, including the subtlety that mutating `v` in
  place during a round is safe because `k±1` always has the opposite parity to
  the entries written that round. Array bounds are exact (`2*max+3` covers
  `k+1+offset` at `k = max`). Backtracking's `diagonal` computation handles the
  right-move `+1` correctly. Prefix/suffix trimming is right, and the early
  returns at `:74-76` cannot produce adjacent same-op chunks. **The one nit:**
  `v = v.slice()` at `:115` is redundant — `trace.push(v.slice())` at `:95`
  already snapshotted, so nothing later observes the mutation. It doubles
  allocation per D step. Remove it, or comment why it is there.
- **`fuzzyMatch`** (`src/lib/fuzzy.ts`). Scoring and the exact-substring
  short-circuit are correct; the O(n+m) claim holds because `hayIndex` is
  monotonic. `isBoundary`'s third clause (`/[a-z]/i.test(prev)`) is the thing
  that stops digits and punctuation from registering as camelCase boundaries —
  genuinely good and the comment does not mention it. See §F4.
- **`generateUuidV7`** bit layout (`ids.ts:72-89`) matches RFC 9562 §5.7.
  **`generateUlid`** timestamp and randomness widths match the ULID spec.
  **`decodeV1Timestamp` / `decodeV6Timestamp`** field reordering is correct.
- **`toInstant`** (`epoch.ts:78-123`). The bigint-nanoseconds-until-the-last-step
  design is right and the `MAX_DATE_MS` bound is inclusive-correct. Fractional
  scaling by exact numerator/denominator is right, including for negatives.
- **`rgbToHsl` / `hslToRgb` / `rgbToOklch` / `oklchToRgb`.** Ottosson's matrices
  are transcribed correctly in both directions, the piecewise sRGB transfer
  function is the real one rather than a 2.2 power, and the `l = 0 || 1`
  division-by-zero in `rgbToHsl` is unreachable because `delta` is `0` there.
- **`toIsoWeekDate`** week arithmetic (`datetime.ts:290-313`) is correct — the
  Thursday anchor and the `Math.round` of a value that is always `weeks - 0.571`
  land on the right integer at every week.
- **`isDstAt`** (`datetime.ts:346-352`) is correct for both hemispheres and for
  negative-DST zones like Europe/Dublin. It misreports a zone that changed its
  *standard* offset mid-year (Samoa 2011, Morocco), which the docstring does not
  mention. One-line caveat, not a bug.
- **`storage.ts`, `clipboard.ts`, `download.ts`** are all correctly wrapped and
  fail soft. `ToolPage`'s share-hydration ordering does what
  `ARCHITECTURE.md §4` claims, including the `key={toolId}` remount that makes
  the race unrepresentable.
- **`markdown.ts` DOMPurify configuration** matches every claim in SECURITY.md,
  including the scheme allowlist's percent-decoding and control-character
  stripping, `FORBID_ATTR: ['style']`, and the raster-only `data:` regex.
- **JSON depth handling.** `measure` really is an explicit stack (`json.ts:180`),
  `MAX_JSON_DEPTH` is enforced with a message that names the number, and all
  three walks in `tree.ts` carry depth caps.

---

## B. Places the code lies

These matter more than usual because the comments are the teaching material.

### B1. The ESLint rule guarding `dangerouslySetInnerHTML` can never fire — confirmed

`eslint.config.js:52-60`:

```js
selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]:not([parent.parent.openingElement.attributes.0])'
```

For a `JSXAttribute`, `parent` is the `JSXOpeningElement` and `parent.parent` is
the `JSXElement`. `JSXElement.openingElement.attributes[0]` therefore *always*
exists whenever the attribute we just matched exists. The `:not()` is
universally false and the rule is inert. Verified empirically: a probe file
containing a bare `<div dangerouslySetInnerHTML={{__html: html}} />` with no
DOMPurify anywhere in the module lints clean, while a deliberate unused variable
in the same file errors — so the file was genuinely linted.

Worse, the message describes a check the selector could not perform even if it
worked:

> dangerouslySetInnerHTML must be paired with a DOMPurify sanitize() call in the
> same module.

An `esquery` selector cannot reason about other statements in the module.

SECURITY.md:98-99 states this as a live control:

> ESLint fails the build on `eval`, `new Function`, `document.write`, and flags
> every `dangerouslySetInnerHTML`.

The first three are real (`eslint.config.js:41-51`). The fourth is not.
`docs/SECURITY-AUDIT.md:294-297` repeats the claim without catching it.

**Fix.** Either make it a plain unconditional `no-restricted-syntax` on the
attribute (`'JSXAttribute[name.name="dangerouslySetInnerHTML"]'`) with a message
saying "argue for it in review" — which is what the surrounding comment at
`:38-40` actually says the intent is — or drop the rule and delete the claim.
A one-implementation module-scope check belongs in a tiny local rule, not a
selector.

### B2. The a11y suite does not scan tools in both themes, and its own docstring says it does — confirmed

`e2e/a11y.spec.ts:14-15`:

> Every tool is scanned in both themes, because a contrast failure that only
> exists in dark mode is exactly the kind that ships.

The loop 45 lines below (`:61-67`) navigates each tool once and never sets
`data-theme`. Only the home page runs both themes (`:52-58`). `PROGRESS.md:132-134`
repeats the claim.

So the exact failure mode the comment names — a dark-mode-only contrast failure —
is the one the suite does not cover.

**Fix.** Nest the theme loop inside the tool loop (44 tests instead of 22), or
correct both the docstring and PROGRESS.md. Given how cheap axe is per page,
scan both.

### B3. Base64's file cap is 8 MiB by one route and 5 MiB by the other — confirmed

`Base64Tool.tsx:42` declares `MAX_FILE_BYTES = 8 * 1024 * 1024` and the picker
toast at `:79` names 8 MiB. But `:205` passes `acceptDrop` **without**
`maxDropBytes`, so a dropped file hits `CodeArea.tsx:34`'s `DEFAULT_MAX_DROP`
of 5 MiB and is refused with a message naming 5 MiB.

Drag a 6 MB file: refused, "above 5.0 MB". Pick the same file with the button:
accepted. `HashGeneratorTool.tsx:230-231` threads its 64 MiB through correctly,
so the pattern exists and Base64 just missed it.

SECURITY.md:143 flattens three different numbers (5 / 8 / 64 MiB) into one table
row: "File size cap | Hash generator, Base64, any drop target".

**Fix.** `maxDropBytes={MAX_FILE_BYTES}` at `Base64Tool.tsx:205`. Split the
SECURITY.md row so each number is stated.

### B4. The gutter cap truncates silently — confirmed

`CodeArea.tsx:200-207`, `MAX_GUTTER_LINES = 20000`, `Math.min(lines, MAX_GUTTER_LINES)`.
Nothing in the UI says numbering stopped. SECURITY.md lists it in the
Bounded-work table under a heading that says caps are "**stated in the UI**
wherever they bite" and closes with "Silent truncation is treated as a bug."

Every other row in that table does surface its cap. This one does not.

**Fix.** Render a final gutter cell reading `…` with a `title`, or drop the row
from the table and say the gutter degrades rather than truncates.

### B5. The NanoID bias comment gets the bias backwards — confirmed

`src/tools/uuid-generator/ids.ts:100-106`:

> With a 62-character alphabet, for instance, byte values 0-255 map to indices
> 0-61 unevenly: **indices 0-47 each get hit by 4 byte values** (0-255 = 4\*64,
> and 256 = 4\*62 + 8 remainder), so **the last few characters** win the modulo
> lottery slightly more often

Counted directly: with `alphabet.length === 62`, indices **0–7** get 5 byte
values each and indices **8–61** get 4. So it is the *first* eight characters
that are over-represented, not the last few, and the "0-47 get 4" figure is
wrong on both bounds. Two errors in one sentence, in a comment whose entire
purpose is to teach modulo bias.

The parenthetical `0-255 = 4*64` is also a non-sequitur — 64 has nothing to do
with a 62-character alphabet.

**Fix.**

> …256 = 4×62 + 8, so indices 0–7 are each reachable from 5 byte values and
> indices 8–61 from only 4. Low indices win the modulo lottery.

### B6. The packed-colour-table justification does not survive arithmetic — confirmed

`src/tools/color-converter/color.ts:53-58`:

> A `{ name: '#rrggbb' }` object of 148 entries is about 4 KB of source; packed
> numbers are under 1.5 KB and parse faster.

The 148 count is correct (verified). The size claim is not. The keys dominate
the source either way; the only difference is the value token: `0xf0f8ff` (8
characters) versus `'#f0f8ff'` (9). That is 148 bytes saved, not 2.5 KB. The
actual object as written is comfortably over 4 KB of source *with* the packed
form.

"Parse faster" is likewise unmeasurable at 148 entries.

This is the most quotable comment in the file and it is the one an interviewer
will do the arithmetic on.

**Fix.** Either delete the justification (packing is fine; it does not need
one) or replace it with the real reason, which is that a packed int makes the
`>> 16 & 0xff` extraction at `:246` and `:556-560` free compared to re-parsing a
hex string 148 times per `nearestNamed` call. That reason is true and is
actually load-bearing.

### B7. Two adjacent JWT comments describe code that is not there — confirmed

`src/tools/jwt-decoder/jwt.ts:116-127`:

```ts
// `JSON.parse` returns `any`, which is assignable to `JwtHeader` with no
// cast needed …
// … the shape is never trusted beyond "some JSON value"; every field is still
// read through an explicit `typeof` check wherever it matters (see the UI).
let header: JwtHeader
try {
  // Funnelled through `unknown` so the widening to JwtHeader is one visible,
  // deliberate step rather than `any` leaking through the whole function.
  header = JSON.parse(headerRaw) as JwtHeader
```

Three problems:

1. "with no cast needed" — followed immediately by a cast.
2. "Funnelled through `unknown`" — it is not. There is no `as unknown as`; it is
   a direct `as JwtHeader`.
3. "every field is still read through an explicit `typeof` check" — falsified 34
   lines later by `:160`, `typeof header.alg`, which throws when `header` is
   `null` (see §A2). The `typeof` guards the *field*, not the object.

TOOL-AUTHORING's style rule says "No `as` casts to silence the compiler; fix the
type." This is one of exactly two places in `src/` that break it, and it wrote
three comments defending itself.

**Fix.** Parse to `unknown`, then narrow with a real predicate
(`isRecord(parsed)`), which removes both the cast and §A2 in one change.

### B8. The `downloadText` security comment names a threat that does not exist — confirmed by reading

`src/lib/download.ts:6-7`:

> A `text/html` blob download that the user then opens is a **same-origin XSS
> vector**

It is not same-origin. A file opened from disk loads over `file://`, and in
every current browser a `file://` document gets an opaque origin — it cannot
read the app's `https://` origin, its `localStorage`, or its cookies. The real
risk from a downloaded HTML file is ordinary local-file phishing/exfiltration,
which is worth defending against, but calling it same-origin XSS misstates the
boundary. SECURITY.md:161-164 repeats the framing.

Separately, `application/xml` is on the allowlist (`:14`). XML is not inert: an
`<?xml-stylesheet?>` processing instruction runs XSLT, which is a script-ish
capability, and browsers honour it for locally opened XML. It is the one entry
on a list whose stated purpose is "nothing here ever emits an active type" that
is arguably active.

**Fix.** Reword to "a downloaded HTML file opens as a live page from the user's
disk and can phish or exfiltrate; the allowlist makes that unreachable." Decide
whether `application/xml` earns its place (no current caller uses it — see
§E1).

### B9. "Every localStorage read is validated" — one call site is not

SECURITY.md:155-156. `src/components/SplitPane.tsx:58` passes no validator. See
§A13.

### B10. SECURITY.md describes a paste control that does not exist — confirmed

SECURITY.md:169-170:

> The app writes to the clipboard only on an explicit click or keystroke, and
> **reads only when the user activates a paste control.**

`readClipboard` (`src/lib/clipboard.ts:36-44`) has zero call sites in `src/`.
There is no paste control. The sentence is vacuously true and implies a feature
that was never built, and the function is dead code.

**Fix.** Delete `readClipboard`, and cut the clause — "the app never reads the
clipboard" is both simpler and stronger.

### B11. `formatRelative` credits `Intl.RelativeTimeFormat` with something it does not do — confirmed by reading

`src/tools/unix-timestamp/epoch.ts:160-162`:

> Walk the unit ladder from the top down, picking the largest unit that still
> rounds to at least 1, the same approach `Intl.RelativeTimeFormat`
> implementations use internally.

`Intl.RelativeTimeFormat` does no unit selection at all — you hand it a value
*and* a unit (`format(-3, 'day')`). There is no internal ladder to imitate. The
comment is confidently citing a spec that says nothing of the kind.

Also, the loop picks the largest unit where `abs >= unit.ms`, which is "at least
1 before rounding", not "rounds to at least 1" — the difference is exactly §A12.

**Fix.** Drop the attribution. If a reason is wanted, the honest one is that
`Intl.RelativeTimeFormat` would give localised output but the app is en-only and
the ladder is 8 lines.

### B12. TOOL-AUTHORING points at a file that does not exist — confirmed

`docs/TOOL-AUTHORING.md:94` tells a new tool author to "see
`src/lib/regexWorker.ts`". The real files are `src/lib/regexRunner.ts` and
`src/lib/regex.worker.ts`. `ARCHITECTURE.md:238` says "Regex safety depends on
Web Workers" without naming a file, so it is fine.

### B13. "a folder containing three things and nothing else" — 12 of 22 folders hold more — confirmed

`docs/TOOL-AUTHORING.md:3-11`. `cron-helper/` has 8 files (`cron.ts`,
`relative.ts`, `ruler.ts`, three tests, tool, CSS), `code-diff/` has 5, nine
others have 4. The rule as written would forbid the CSS module every tool has.

**Fix.** State the real rule: one logic module per concern plus its test, one
`.tsx`, one `.module.css`.

### B14. "There is no other list to update" — there are five — confirmed

`README.md:122-124` and `ARCHITECTURE.md:96-98` both claim adding a tool means
one registry entry and one folder. Hardcoded "22"/"Twenty-two" also live at:

- `src/app/AppShell.tsx:193` — "Search 22 tools…"
- `src/app/HomePage.tsx:29` — "Twenty-two tools.", **thirteen lines above**
  `:42`'s derived `{TOOLS.length}`
- `index.html:9` and `:20`
- `package.json:6`

Plus `e2e/toolIds.ts`, which is a deliberate duplicate and at least has a drift
guard (`e2e/registry.spec.ts:15`).

Adding a 23rd tool leaves the header, the page copy, and the meta description
lying, and nothing fails.

**Fix.** Derive `AppShell`'s and `HomePage`'s strings from `TOOLS.length` — the
latter is already doing it on the next line. Add a test asserting `index.html`
contains `String(TOOLS.length)` if the meta description is worth keeping in
sync.

### B15. "The bundle for the shell plus one tool is under 100 KB gzipped" — false

`README.md:24`. Measured from `dist/` via the repo's own
`scripts/check-bundle-size.mjs`: the **shell alone** is ~97 KB gzipped (index
73.6 + react 17.1 + css 6.4). Shell + JSON Formatter ≈ 107 KB; shell + Markdown
≈ 123 KB; shell + SQL Formatter ≈ 174 KB (the `sql-formatter` chunk alone is
74 KB).

The build's own budget constant is 130 KB initial
(`scripts/check-bundle-size.mjs:20`), which is the honest number and is the one
CI enforces.

**Fix.** Quote the enforced budget, and mention the SQL Formatter as the one
heavy tool — that is a more interesting sentence than the false one.

### B16. `deploy/Dockerfile:1` says "~250 KB of static files" — `dist/` is 1,468 KB

83 files; assets alone are 1,271 KB uncompressed (mostly self-hosted font
subsets, which is a defensible cost but not 250 KB).

### B17. The deployed security headers are not the documented ones — confirmed

SECURITY.md:195 documents
`Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.
All four deploy targets ship
`camera=(), microphone=(), geolocation=(), payment=(), usb=()`
(`deploy/_headers:10`, `deploy/vercel.json:20`, `deploy/nginx.conf:18`).
`interest-cohort` is documented but never deployed; `payment` and `usb` are
deployed but never documented.

`deploy/_headers:12` also adds `Cross-Origin-Opener-Policy: same-origin`, which
is in neither the doc nor the other three configs.

Most significant: `deploy/nginx.docker.conf:6-9` — the config the Dockerfile
actually ships (`deploy/Dockerfile:14`) — omits `Permissions-Policy` and
`Strict-Transport-Security` entirely. The Docker path is the weakest of the
five and the docs do not say so.

The CSP string itself is byte-identical across the doc and all four configs.

**Fix.** Make one header block the source of truth and generate or copy it;
at minimum bring `nginx.docker.conf` up to parity and correct the doc.

### B18. The cron macro error omits `@reboot` — confirmed by reading

`cron.ts:257-262`:

> Unknown macro "@x". Standard cron defines @yearly, @annually, @monthly,
> @weekly, @daily, @midnight, @hourly.

`@reboot` is defined by Vixie cron and is the macro people most often type
without thinking. The message asserts a complete list and is incomplete.

**Fix.** Add `@reboot` to `MACROS` as a recognised-but-unschedulable entry with
its own message ("`@reboot` fires once when cron starts; there is no clock time
to project"), which is far more useful than "unknown macro".

### B19. `detectUnit`'s stated rationale does not match its boundaries — confirmed by reading

`epoch.ts:26-29`:

> The boundaries below sit **one digit past** each unit's "now" count, so a
> present-day value lands **solidly inside** its bucket rather than on an edge.

"Now" is 10 digits in seconds and the seconds bucket is `count <= 10`. Same for
13/milliseconds and 16/microseconds. Every present-day value sits exactly on the
*top* edge of its bucket, not one digit inside it.

The heuristic itself is fine and the ambiguity discussion below it is correct.
Only the "one digit past / solidly inside" sentence is wrong.

### B20. `parseField`'s "matches nothing" branch is unreachable — confirmed by reading

`cron.ts:152-154`. `parsePart` either returns an error or a non-empty array
(`start <= end` is guaranteed by the `from > to` check at `:198` and by
`spec.min <= spec.max`), so `values.size` is never `0`.

Not harmful, but it is an error message that can never be seen, sitting in a
file whose selling point is that its error messages are the product.

### B21. "Deferring to the platform parser is safe" for RFC 2822 — overstated

`datetime.ts:192-196`:

> RFC 2822 always carries an explicit zone …, this is the one case where
> deferring to the platform parser is safe, precisely because the shape has
> already been verified.

Verifying the shape does not make `Date.parse` deterministic. `RFC2822` at `:60`
accepts `[A-Z]{1,5}` as a zone (so `EST`, `PDT`, `CEST`, `XYZ`) and `\d{2,4}` as
a year. ECMA-262 leaves both obsolete named zones and two-digit-year
interpretation implementation-defined. `Date.parse('Mon, 15 Mar 26 14:30:00 EST')`
is not guaranteed to agree across engines — which is precisely the class of
problem the file's own opening paragraph exists to avoid.

**Fix.** Either narrow the zone group to `[+-]\d{4}|UT|UTC|GMT|Z` and parse the
offset by hand like the ISO branch already does, or keep `Date.parse` and say
the truth: "named zones and two-digit years fall back to the engine and may vary."

### B22. Test names that promise more than the assertions check

Two representative cases (not exhaustive — this is a category, not a list):

- `src/lib/diff.test.ts` asserts the *shape* of `toUnifiedDiff`'s output. No
  test asserts it is a valid patch, which is why §A1 shipped. A test named
  around "the format `git apply` reads" should exercise that claim.
- `e2e/a11y.spec.ts` — the file docstring is the promise; see §B2.

---

## C. Inconsistency across the 22 tools

Measured against `docs/TOOL-AUTHORING.md`.

### C1. Sample buttons (rule 7: "Every tool that can be demonstrated should have a Sample button in its toolbar")

- **~~Missing entirely:~~ FIXED in `0bcd46a`.** `base64/Base64Tool.tsx` (Swap +
  File only) — notable because TOOL-AUTHORING names Base64 as *the reference
  implementation* new authors are told to read first — and
  `unix-timestamp/UnixTimestampTool.tsx` (Clear only). Both now have a Sample
  button in the toolbar (`Base64Tool.tsx:122`, `UnixTimestampTool.tsx:194`).
- **Present but not in the toolbar:** `regex-tester/RegexTesterTool.tsx:182-189`
  puts samples in a row inside the Pattern panel;
  `cron-helper/CronHelperTool.tsx:297-318` has a 22-button Presets panel that
  duplicates the toolbar's Sample.
- **Sample that is actually a Reset:**
  `color-converter/ColorConverterTool.tsx:68` is `onClick={() => patch(DEFAULTS)}`
  and `test-data/TestDataTool.tsx:197-199` is `setState(DEFAULTS)`. Labelling a
  reset "Sample" is a small lie in the UI.

### C2. Clear buttons

- **Missing:** `ColorConverterTool`, `HttpClientTool` (`:200-205` is a lone
  Sample), `TestDataTool` (`:224-234` is Sample + Download).
- **In the wrong place:** three tools put Clear in the `OptionsBar` instead of
  `ToolShell actions` where the other 16 put it —
  `base64/Base64Tool.tsx:178-186`, `html-entities/HtmlEntitiesTool.tsx:110-118`,
  `url-encoder/UrlEncoderTool.tsx:138-146`.
- **Different semantics:** `uuid-generator/UuidGeneratorTool.tsx:129` is
  `setIds([])` — alone among 19 Clears it clears the *output* and leaves every
  input intact. `datetime-converter/DateTimeConverterTool.tsx:198` clears only
  `input`, leaving `durationFrom`/`durationTo`/`pinnedZones`, and is
  `disabled={!state.input}` so it can never clear them.
  `code-diff/CodeDiffTool.tsx:171` clears `left`/`right` but not
  `leftName`/`rightName`.

### C3. `shapeValidator` cannot express the constraints the tools need — systemic

`src/tools/useShareState.ts:64-66` supports only
`'string' | 'boolean' | 'number' | 'string[]'`. Every union-typed and every
range-constrained field in every tool is therefore validated as merely "a string"
or "a number", and arbitrary values from an inbound `#s=` link pass.

Confirmed consequences:

- `uuid-generator/UuidGeneratorTool.tsx:51` — `nanoidLength: 'number'`,
  unbounded. This is §A10, a real hang/throw.
- `http-client/HttpClientTool.tsx:58` — `method: 'string'`, passed straight to
  `fetch(url, { method })` at `http-client/http.ts:225-226` with no membership
  check against `HTTP_METHODS`.
- `test-data/TestDataTool.tsx:77` — `outputFormat: 'string'`; the `switch` at
  `:179-192` has **no `default`**, so an unrecognised value returns `undefined`
  from a function TypeScript believes returns `string`.
- `sql-formatter/SqlFormatterTool.tsx:38` — `dialect: 'string'`, even though
  `isSqlDialect` already exists at `sql.ts:71` and is used in the UI at `:109`
  but not in the validator. Degrades safely via the `try/catch` at `sql.ts:108`.
- `sql-formatter/SqlFormatterTool.tsx:39-40` — `indentWidth` and
  `linesBetweenQueries` as bare `'number'`.

**Fix.** Let the shape accept a predicate as well as a kind string:

```ts
type FieldSpec = 'string' | 'boolean' | 'number' | 'string[]' | ((v: unknown) => boolean)
```

Then `nanoidLength: (v) => typeof v === 'number' && v >= 1 && v <= 128` and
`method: (v) => HTTP_METHODS.includes(v as HttpMethod)`. That is a ~6-line
change to `useShareState.ts` and it closes A10 structurally instead of at one
call site. This is the single highest-leverage cleanup in the review.

Related, smaller: `datetime-converter/DateTimeConverterTool.tsx:103` —
`pinnedZones: 'string[]'` is uncapped, and nothing stops ~400 IANA zone names
going into a URL. `:104`'s `addZone` is dropdown-cursor position, not state
worth sharing. `json-tree/JsonTreeTool.tsx:94` keeps `filter` in plain
`useState`, so a shared JSON-tree link loses the filter the sender was looking
at.

Good news, verified: **no secret or credential-ish field is in any share state.**
`jwt-decoder/JwtDecoderTool.tsx:61-65` (HMAC secret) and
`http-client/HttpClientTool.tsx:52-58` (headers and body) both exclude
deliberately, with the reasoning written down. `uuid-generator` correctly keeps
generated ids out (`:28-30`).

### C4. Copy buttons missing where a value is produced (rule 9)

- **`text-diff/TextDiffTool.tsx` — zero `CopyButton` in the file.** No way to
  copy the diff, a hunk, a row, or the summary. Its sibling `code-diff` has
  "Copy patch" at `:152`. `tools/shared/DiffView.tsx` (439 lines) has none
  either, so neither diff tool can copy a row.
- **`text-stats/TextStatsTool.tsx` — zero `CopyButton`.** Every stat
  (`:93-130`), the top-words list (`:207-222`), the character frequency list
  (`:227-234`) and the longest-words chips (`:255-259`) are uncopyable.
- `cron-helper/CronHelperTool.tsx:154` — the English description, the headline
  output of the tool, sits in a `Callout title` with no copy. Same for the
  per-field rows (`:163-197`) and the ten projected run times (`:226-278`).
- `color-converter/ColorConverterTool.tsx:305` — the contrast ratio, the tool's
  headline measurement, has no copy.
- `jwt-decoder/JwtDecoderTool.tsx:246-252` — the registered-claims `StatGrid`
  has no per-row copy, while the raw header and payload do.
- `http-client/HttpClientTool.tsx:409-425` — the status line and every response
  header row have no copy; only cURL and the whole body do.
- `unix-timestamp/UnixTimestampTool.tsx:202-219` — the live "now" readout has no
  copy; you have to click "Snap top to now" first.
- `datetime-converter/DateTimeConverterTool.tsx:454-459` — the formatted
  duration has no copy while the four totals below it do.
- `url-parser/UrlParserTool.tsx:174-187` — path segments are bare `<span>`s
  while every other readout in the same file goes through `PartRow`'s
  `CopyButton`.

**Bug, not just inconsistency:** `url-parser/UrlParserTool.tsx:141` —

```tsx
<PartRow label="password" value={result.parts.password ? '••••••' : ''} />
```

`PartRow` (`:281-298`) wires `CopyButton value={value}`, so the copy button
copies the literal bullet characters. Either pass the real password to the copy
and keep the mask for display, or drop the copy affordance on that row.

### C5. Empty states (rule 7: "'No input yet' is not an empty state")

`EmptyState` exists in `src/components` and nine tools bypass it with an
inline-styled paragraph:

`hash-generator/HashGeneratorTool.tsx:243-252` ("Nothing to hash yet." — verbatim
the anti-pattern the rule names), `markdown/MarkdownTool.tsx:228-230`,
`unix-timestamp/UnixTimestampTool.tsx:288` and `:369`,
`datetime-converter/DateTimeConverterTool.tsx:227` and `:410`,
`uuid-generator/UuidGeneratorTool.tsx:259-263`,
`cron-helper/CronHelperTool.tsx:140-143`, `test-data/TestDataTool.tsx:301` and
`:399-404` (uses `Callout tone="info"` where `EmptyState` is the component for
this), `json-tree/JsonTreeTool.tsx:563-572`,
`text-stats/TextStatsTool.tsx:253`. `color-converter` has no empty state at all.

### C6. Error surfacing (rules 8, 10)

Broadly correct — every parse-failure `Callout tone="err"` carries `live`. Three
exceptions, all of which change in response to typing and so need the live
region:

- `jwt-decoder/JwtDecoderTool.tsx:204` — no `live`, unlike `:196` in the same
  file.
- `code-diff/CodeDiffTool.tsx:309` and `text-diff/TextDiffTool.tsx:187` — the
  "too dissimilar" degradation warning has no `live`.

### C7. One tool bypasses the shared clipboard helper — confirmed

`base64/Base64Tool.tsx:96`:

```ts
void navigator.clipboard?.writeText(result.output)
```

Every other copy in the app goes through `CopyButton` / `copyText`
(`src/lib/clipboard.ts:9`), which has the non-secure-context `execCommand`
fallback and returns success. This one silently no-ops on `file://` or plain
HTTP and gives no feedback either way. The hotkey looks broken rather than
unsupported.

### C8. Cross-tool imports — clean

Exactly one, and it is the documented exception:
`json-tree/JsonTreeTool.tsx:24` imports `describeJsonError` from
`json-formatter/json`, matching `ARCHITECTURE.md:75-77`. Every other
`@/tools/*` import is `shared/`. Verified by sweeping every `.ts`/`.tsx` under
`src/tools/`.

### C9. Accessibility — clean

Every icon-only `Button` carries `aria-label`; every icon-only `CopyButton`
passes `label`, which `CopyButton.tsx:61` turns into `aria-label`; every input
has a visible label, an `aria-label`, or an `id` cloned in by `Field.tsx:58-69`.
Checked all 22 tools. Nothing to report.

### Fully compliant tools

`json-formatter`, `sql-formatter`, `case-converter`, `code-diff`, `url-parser`.
`code-diff` has the most complete toolbar in the codebase and `url-parser` has
the best copy coverage — they are the right reference implementations, and
TOOL-AUTHORING should point new authors at one of them instead of at `base64`,
which is missing a Sample button and puts Clear in the wrong place.

---

## D. Duplication worth removing

Only cases with genuinely repeated non-trivial logic. Things that merely look
similar are listed at the end as explicitly *not* worth extracting.

### D1. Base64 byte conversion, written four times

The chunked `String.fromCharCode` loop (which exists to dodge the
spread-argument limit) and the `=` re-padding are both easy to get subtly wrong,
which is exactly why one copy should exist.

`bytesToBase64`:
- `src/tools/base64/base64.ts:37-44`
- `src/tools/hash-generator/hash.ts:41-48` — byte-identical minus one comment
- `src/lib/share.ts:31-39` — same loop plus the url-safe tail
- ~~`src/tools/jwt-decoder/jwt.ts` `base64UrlEncodeBytes`~~ — removed in `e74ec83`

`base64ToBytes`:
- `src/tools/base64/base64.ts:46-51`
- `src/tools/jwt-decoder/jwt.ts:52-59` (`base64UrlDecodeText`)
- `src/tools/jwt-decoder/jwt.ts:61-68` (`base64UrlDecodeBytes`)
- `src/lib/share.ts:41-47` (`fromBase64Url`)

The two in `jwt.ts` are duplicates **of each other inside one file**:
`base64UrlDecodeText` is exactly
`new TextDecoder('utf-8',{fatal:true}).decode(base64UrlDecodeBytes(segment))`.
Six lines vanish for free.

**Extract** `src/lib/base64.ts` exporting `bytesToBase64(bytes, urlSafe?)` and
`base64ToBytes(text)`. Four consumers, fiddly logic, and `ARCHITECTURE.md §2`
already mandates it.

### D2. `tzOffsetMs` + `zonedTimeToUtc`, and the comment that justifies the copy

`src/tools/unix-timestamp/epoch.ts:208-264` and
`src/tools/datetime-converter/datetime.ts:91-139` are the same two functions.
`datetime.ts:124` says so:

> See the unix-timestamp tool's `epoch.ts` for the same technique, **written
> independently because tool folders do not import each other.**

That reads the architecture rule as forbidding the fix. `ARCHITECTURE.md:75-78`
says the opposite: a tool folder must not import another tool folder, and
"anything two tools need moves to `src/lib` or `src/components`." The comment
cites half of a rule to license violating the other half.

The cost is not hypothetical: §A5 (the `Date.UTC` year bug) has to be fixed
twice, and a fix applied to one and not the other is exactly how these two
tools start disagreeing about the same instant.

Same shape at `src/tools/cron-helper/relative.ts:4-8`, which carries the same
self-justifying comment.

**Extract** `src/lib/zonedTime.ts` (`tzOffsetMs`, `zonedTimeToUtc`,
`parseDatetimeLocalValue`, `toDatetimeLocalValue`). This is the single largest
duplication in the repo and the one an interviewer will find fastest, because
the comment points at it.

### D3. `formatRelative`, three implementations that give different answers

```
src/tools/cron-helper/relative.ts:10-34    (target, from)     1000ms → 'now',         second..day
src/tools/unix-timestamp/epoch.ts:153-171  (from, to)         5000ms → 'just now',    minute..year
src/tools/jwt-decoder/jwt.ts:197-216       (targetMs, nowMs)  none   → 'in a moment', second..day
```

Three things wrong at once:

1. Same algorithm three times (unit ladder → round → pluralize → `in X`/`X ago`);
   two share a literally identical final pair of lines.
2. **The argument order is inverted between two of them** — `relative.ts` is
   `(target, from)`, `epoch.ts` is `(from, to)`. Both take two `Date`s, so
   nothing catches a swap.
3. They disagree on the same instant. A token expiring in a year reads "in 365
   days" in the JWT tool and "in 1 year" in the timestamp tool; 3 seconds out
   reads "in 3 seconds" (jwt) versus "just now" (epoch).

**Extract** `src/lib/relativeTime.ts` with one signature and an options object
for the threshold and the unit ceiling. Fix §A12 once while you are there.

### D4. `byteLength` — a private copy of an existing `src/lib` function

`src/lib/format.ts:31-33` is canonical, and `Base64Tool.tsx:14` /
`JsonFormatterTool.tsx:15` import it correctly. But
`src/tools/json-formatter/json.ts:111-113` declares a verbatim private
duplicate, and there are two more inline copies at
`src/tools/http-client/http.ts:245` and
`src/tools/text-stats/TextStatsTool.tsx:79`. Same module tree, both ways.
Delete the copies, add the import.

### D5. The labelled-copyable-readout row, built six times

Structurally identical inline components, none of them promoted to
`src/components`:

- `unix-timestamp/UnixTimestampTool.tsx:108-147` — its own comment says
  *"Matches the pattern used by the hash tool's digest list."*
- `datetime-converter/DateTimeConverterTool.tsx:109-148` — *"the same pattern
  the hash and unix-timestamp tools use."*
- `uuid-generator/UuidGeneratorTool.tsx:345-383` (`DecodeRow`)
- `hash-generator/HashGeneratorTool.tsx:255-302`
- `cron-helper/CronHelperTool.tsx:163-197` and `:242-277`

Two of the six wrote down that they were duplicating a known pattern and
duplicated it anyway. TOOL-AUTHORING rule 4 says: "If something genuinely does
not exist, add it to `src/components/` so every tool gets it."

**Extract** `<ResultRow label value mono? />` into `src/components`. It also
fixes half of §C4 for free, since every one of those tools then gets a copy
button on every produced value.

### D6. The file-picker + size-cap block, twice

`base64/Base64Tool.tsx:75-87` and `hash-generator/HashGeneratorTool.tsx:128-140`
are identical modulo the variable name, including the message string. The JSX
around them (hidden input + trigger button + the `e.target.value = ''` reset
trick) is duplicated too — `Base64Tool.tsx:118-131` vs
`HashGeneratorTool.tsx:162-175` — differing only in `aria-label`. A third copy
of the sentence lives at `CodeArea.tsx:137-143`.

**Extract** `<FilePickerButton cap onLoad />` into `src/components`, sharing the
refusal message with `CodeArea`'s drop path. That also closes §B3 structurally,
because the cap becomes a single value both routes read.

### D7. The `.table` block, three times

`.table`, `.table th`, `.table td`, `.table tr:last-child td` are byte-identical
(one cosmetic `var(--sp-2)` vs `var(--sp-2) var(--sp-2)`, which computes the
same) across `test-data/TestDataTool.module.css:1-25`,
`http-client/HttpClientTool.module.css:1-25`, and
`url-parser/UrlParserTool.module.css:1-25`. ~75 lines. Hoist to a `.data-table`
in `src/styles/base.css`; column modifiers stay local.

### D8. The `padding: var(--sp-3)` wrapper, 21 times

`<div style={{ padding: 'var(--sp-3)' }}>` appears 21 times across 12 tools
(five in `HttpClientTool.tsx` alone). `Panel` already has a `padded` prop, but
it applies `--sp-4` (`Panel.module.css:67-70`), so tools that wanted `--sp-3`
hand-rolled a div. This is a reconciliation, not an extraction: add a
`padded="sm"` variant or a `.pad-3` utility and delete 21 inline style objects.

### Genuinely similar but NOT worth extracting

Listed so the judgement is visible rather than implied:

- **Debounce**, inlined twice (`TextStatsTool.tsx:60-64`,
  `RegexTesterTool.tsx:85-89`), 5 lines each, differing only in the constant
  (120 vs 150 ms). Two sites is not a hook. Extract on the third.
- **Copy-then-toast**, twice (`JsonTreeTool.tsx:517-519`,
  `ColorConverterTool.tsx:442-444`). Three lines.
- **Row-list edit helpers** (`HttpClientTool.tsx:485-488`,
  `UrlParserTool.tsx:67-73`, `TestDataTool.tsx:205-211`). Two lines each; the
  smell of a missing `useRowList`, but under the bar.
- **Error describers.** `describeJsonError` (`json.ts:473`),
  `explainFetchFailure` (`http.ts:282`), `describeSqlError` (`sql.ts:120`) share
  only the one-line `error instanceof Error ? … : String(error)` idiom. The
  bodies are entirely domain-specific. Leave them — they are the best code in
  the repo.
- **`readingTimeMinutes` (238 wpm) vs `estimateReadingMinutes` (200 wpm).**
  Different constants, one line each. Deliberate divergence, not duplication —
  though somebody should decide which number is right.
- **`FALLBACK_ZONES` + `listZones()`**, copy-pasted between
  `UnixTimestampTool.tsx:41-83` and `DateTimeConverterTool.tsx:42-84` with an
  acknowledging comment. This one *is* worth moving, but it moves as part of D2.

---

## E. Dead code, unused exports, unreachable branches

### E1. Exports with zero references anywhere, including tests — **FIXED in `e74ec83`**

All twelve are gone or demoted to module-private:

| Symbol | Was | Note |
| --- | --- | --- |
| `readClipboard` | `src/lib/clipboard.ts` | Removed. Also falsified a SECURITY.md sentence — §B10 still needs the doc edit |
| `truncateMiddle` | `src/lib/format.ts` | Removed. Also had an unguarded `max <= 0` path |
| `__clearHotkeys` | `src/lib/hotkeys.ts` | Removed |
| `__resetRegexRunner` | `src/lib/regexRunner.ts` | Removed |
| `isString`, `isBoolean`, `isRecord` | `src/lib/storage.ts` | Removed |
| `OptionRow` | `src/components/Field.tsx` | Removed |
| `IconPlay` | `src/components/Icon.tsx` | Removed |
| `NAMED_COLORS` | `src/tools/color-converter/color.ts` | Removed |
| `base64UrlEncodeBytes` | `src/tools/jwt-decoder/jwt.ts` | Removed |
| `base64UrlDecodeBytes` | `src/tools/jwt-decoder/jwt.ts` | Demoted to private |

**One observation survives the fix.** Two of those were `__`-prefixed "test
seams" for tests that were never written. `hotkeys.ts` is 164 lines of
key-matching logic with **no unit test at all**, in a repo whose stated testing
strategy (`ARCHITECTURE.md §9`) is "every `.ts` logic file". Deleting the seam
removes the evidence but not the gap: `matchesHotkey` and the input-target
exclusion logic at `hotkeys.ts:87` are exactly the kind of thing that breaks
silently on a platform you did not test on. Worth a test file, not just a
deletion.

`storageAvailable` is still used only by `storage.test.ts`; `__resetStorageProbe`
is a legitimate seam used by the same test — both correctly kept.

**Not dead, checked:** `diffSequences`, `splitLines`, `fuzzyMatch`,
`normalizeBase64`, `toHexDump`, `oklchToRgb`, `matchesDay`, `sortKeysDeep`,
`parsePath`, `makeRng`, `countSyllables`, `decodePunycodeLabel`,
`constantTimeEqual` and the rest are all called internally by their own module.

### E2. Props that are read but never supplied, and the branches and CSS they strand

`SplitPane` has only two call sites (`tools/shared/TwoPane.tsx:41-47`,
`markdown/MarkdownTool.tsx:295-301`), and both pass only `storageKey`,
`labelFirst`, `labelSecond`, `first`, `second`:

- `direction` is always `'horizontal'` → dead: `SplitPane.tsx:78-80` (vertical
  arm), `:119` (`aria-orientation`), `:132-133` (Up/Down keys), and all of
  `SplitPane.module.css:13, 38, 60, 79-80`.
- `responsive` defaults `true`, never passed → `:107` always true.
- `storageKey` always supplied → the `: defaultRatio` arm at `:58` and the
  `if (storageKey)` guard at `:67` never take the false path.
- `defaultRatio` never overridden.

Same pattern elsewhere, each stranding one CSS rule:

| Prop | Declared | Dead branch | Dead CSS |
| --- | --- | --- | --- |
| `ToolShell.padded` | `ToolShell.tsx:41` | `:74` | `ToolShell.module.css:92` |
| `Panel.flush` | `Panel.tsx:16` | `:47` | `Panel.module.css:12` |
| `Button.fullWidth` | `Button.tsx:13` | `:42` | `Button.module.css:103` |
| `SegmentedControl.fullWidth` | `Field.tsx:149` | `:185` | `Field.module.css:137,142` |
| `Stat.wide` | `StatGrid.tsx:9` | `:26` | `StatGrid.module.css:45` |
| `Dialog.labelledBy` | `Dialog.tsx:17` | `:161` left side always `undefined` | — |

`Panel.padded` and `Stat.accent` *are* used, so this is not "delete every
optional prop".

This is the cleanest mechanical win in the review: seven props, seven branches
and six CSS rules removed in one pass, and it makes `ARCHITECTURE.md`'s
"fourteen components, no more" claim more honest by making the fourteen smaller.

### E3. Unused CSS module classes

| File:line | Class |
| --- | --- |
| `src/app/AppShell.module.css:27` | `.mark` |
| `src/components/Callout.module.css:37` | `.mono` (the `.detail code` half of the same rule *is* used) |
| `src/tools/http-client/HttpClientTool.module.css:97` | `.statusMeta` |
| `src/tools/markdown/MarkdownTool.module.css:12` | `.toolbarDivider` |
| `src/tools/shared/TwoPane.module.css:78` | `.issues` |
| `src/tools/url-parser/UrlParserTool.module.css:149` | `.tableFoot` |

Not dead, checked: `CodeDiffTool.module.css`'s `.tab2/.tab4/.tab8` are reached
by computed access at `CodeDiffTool.tsx:315` (`styles[\`tab${state.tabWidth}\`]`).

### E4. Redundant work

- `src/lib/diff.ts:115` — `v = v.slice()` is unnecessary; `trace.push(v.slice())`
  at `:95` already snapshotted. One extra `Int32Array` allocation per D step.
- `src/tools/color-converter/color.ts:555-561` — `nearestNamed` runs
  `rgbToOklch` over all 148 packed colours on every call, i.e. every keystroke.
  The candidate OKLab coordinates are constant; precompute them once at module
  scope. Not a performance problem at this size, but it is the obvious question.
- `src/tools/color-converter/color.ts:472-485` — `isOutOfSrgbGamut` re-implements
  `oklchToRgb`'s entire inverse chain rather than sharing a
  `oklchToLinearRgb` helper with `:444-463`. Ten lines of matrix constants
  written twice, in the same file, where a transcription slip in one copy would
  be invisible.

### E5. Leftover scaffolding — clean

Zero `TODO`/`FIXME`/`XXX`/`HACK`. Zero commented-out code blocks. One
`console.*` in shipped code (`ToolErrorBoundary.tsx:37`) and it is correct. No
unused files. All 27 devDependencies are genuinely used — `@testing-library/dom`
is a required peer of `@testing-library/react@16`, `@types/node` is pulled in by
`tsconfig.node.json`'s `"types": ["node"]`, `@vitest/coverage-v8` backs
`vite.config.ts`'s `provider: 'v8'`.

### E6. Logic living in a `.tsx` (rule 1)

`color-converter/ColorConverterTool.tsx:462-469` — `naiveHslRamp` is a pure
transform (loop, arithmetic, colour conversion) in the UI file. The comment at
`:455-461` says it is "deliberately not exported from `color.ts`", which also
means it has no test, while `buildRamp` — the function it exists to be compared
against — does. If it is worth shipping as a comparison, it is worth testing.

---

## F. What an interviewer will poke at

### F1. "Why is the tool folder allowed to duplicate `src/lib`-shaped code?"

§D2 and §D3. The answer currently on record is a comment that misreads the
project's own architecture rule. This is the question I would open with, because
the comment volunteers it.

### F2. "Your hand-written diff is the centrepiece. Does its patch apply?"

§A1. The Myers implementation is genuinely good — correct, well-bounded,
well-explained, and the in-place-mutation parity subtlety is handled right. The
wrapper around it emits a file `git apply` refuses. That contrast is the whole
interview: strong core, unverified boundary. Fixing A1 turns this from the worst
question into the best answer.

### F3. "You wrote a modulo-bias rejection sampler. Which indices are biased?"

§B5. The code is right; the comment answers the question wrongly. Anyone who
asks this asks it *because* the comment is there.

### F4. Genuinely good and under-explained — worth a comment

- **`src/lib/diff.ts:105-113`.** Mutating `v` in place during round `d` is safe
  only because `v[k±1]` always has the opposite parity to the entries written in
  that round. That is the non-obvious invariant that makes the loop correct, and
  nothing says so. (It also explains why `:115`'s `v.slice()` is not needed —
  someone was probably nervous about exactly this.)
- **`src/lib/fuzzy.ts:43`.** The `/[a-z]/i.test(prev)` clause is what stops
  digits and punctuation from registering as camelCase boundaries. The comment
  above it explains the lower-then-upper test and not the guard, which is the
  part a reader would otherwise delete as redundant.
- **`src/lib/share.ts:64-67`.** "Not awaited: the writer only settles once the
  reader below drains it, so awaiting here would deadlock" is exactly the right
  comment. Keep it. (Minor: if `write` rejects, the `.then(close)` never runs
  and the rejection is unhandled — add a `.catch`.)
- **`src/tools/uuid-generator/ids.ts:5-15`.** The CSPRNG rationale, and
  specifically "using the CSPRNG unconditionally here means nobody has to
  remember which call site was the sensitive one later", is the best paragraph
  in the repo.
- **`src/tools/jwt-decoder/jwt.ts:39-45`.** The explanation of why
  `isHmacAlgorithm` is a manual comparison rather than `.includes` is precisely
  the kind of "why, not what" the style guide asks for.
- **`SECURITY.md`'s `FORBID_ATTR: ['style']` paragraph.** DOMPurify sanitises
  markup, not CSS values, so `background:url(…)` survives its defaults and fires
  an outbound request. Correct, non-obvious, and it names why it matters for
  *this* app's specific claim. This is the strongest security writing in the
  repository and it is worth leading with.

### F5. Smaller "why did you do it this way?" items

- `src/tools/color-converter/color.ts:254` — `/^#?([0-9a-f]{3,8})$/` makes the
  `#` optional, so `cafe` parses as `#ccaaffee` and `decade` as `#decade`.
  Deliberate convenience or accident? Either way it deserves the one-line answer.
- `src/tools/color-converter/color.ts:227` — `parseChannel` rejects `none`,
  while `parseAlpha` at `:219` accepts it. `rgb(none 0 0)` is valid modern CSS.
- `src/tools/color-converter/color.ts:490-500` — `relativeLuminance` ignores
  alpha, so contrast against a semi-transparent colour is computed as if it were
  opaque. The UI does not say so.
- `src/tools/unix-timestamp/epoch.ts:178-185` — `toRfc3339` and `toIso8601` are
  two exported functions with identical bodies (`date.toISOString()`). The
  comments justify the naming; a reviewer will still ask why both exist.
- `src/lib/diff.ts:289` — `tokenizeWords`' `[A-Za-z0-9_]+` class means the "word"
  diff is character-level for any non-ASCII text. Fine for code, surprising for
  prose, and undocumented.
- `src/tools/datetime-converter/datetime.ts:84-86` — `validateCivilFields`
  rejects `24:00` and `:60`, both of which are legal ISO 8601 (end-of-day and
  leap second). Defensible; say so.
- `src/lib/format.ts:36-39` — `truncateMiddle` produces nonsense for `max <= 0`
  (`slice(0, -1)`). Dead today (§E1), so delete rather than guard.

---

## Status at the time of writing

Fixes were landing in parallel with this review. Last re-verified against the
working tree on top of `e74ec83`:

| Finding | Status |
| --- | --- |
| §A1 patch output | **Fixed**, re-tested against `git apply --check` — but see §A1b |
| §A1b trailing-newline-only patch | **Open, new**, introduced by the A1 fix |
| §A3 Invalid Date into render | **Fixed**, re-verified |
| §A4 negative duration days | **Fixed**, re-verified with a regression sweep |
| §C1 Sample buttons | **Fixed** (`0bcd46a`) |
| §E1 dead exports | **Fixed** (`e74ec83`) |
| §A2 JWT `null` header crash | Open |
| §A5 `Date.UTC` year 0-99 | Open, re-confirmed (`0050-03-15` → `1950-03-15`) |
| §A6 cron backwards-range advice | Open, re-confirmed |
| §A7 cron drops seconds | Open, re-confirmed |
| §A8 cron accepts `1-2-3` | Open, re-confirmed |
| §A9 gradian hue | Open, re-confirmed (`hsl(100grad …)` → `null`) |
| Everything else | Open, not re-checked since first confirmation |

**The working tree does not typecheck right now.** The three new A3 tests call
`parseFlexible` with one argument:

```
src/tools/datetime-converter/datetime.test.ts(247,20): error TS2554: Expected 2 arguments, but got 1.
src/tools/datetime-converter/datetime.test.ts(253,12): error TS2554: …
src/tools/datetime-converter/datetime.test.ts(257,12): error TS2554: …
```

`parseFlexible(input, options)` requires the `ParseOptions` second argument.
`vitest` passes (767 tests, 37 files) because esbuild strips types without
checking them; `npx tsc -b` fails, so `pnpm verify` and CI would too. Add
`{ zone: 'UTC', dateOnlyAs: 'utc' }` to all three calls.

This is worth noting beyond the immediate fix: it is the one seam where a green
test run does not imply a green build, and it is why `verify` runs both.

## Suggested order of work

1. **§A1b** — finish the patch fix. §A1 is closed; the trailing-newline-only
   case still emits a headers-only patch, and the pane view and the patch view
   now disagree about whether anything changed.
2. **§A2** — the remaining uncaught throw into the render path. One guard.
3. **§B1** — a security control that does not run, asserted in SECURITY.md.
4. **§C3** — give `shapeValidator` predicates. Closes §A10 structurally and
   hardens four other tools at once.
5. **§A6, §A7, §A8** — the cron message and description bugs. Small, and this is
   the module whose selling point is that its output is correct English.
6. **§A5 + §D2** — extract `zonedTime` to `src/lib`, fix the `Date.UTC` year bug
   once instead of twice.
7. **§A4, §A9, §A11, §A12** — the remaining logic bugs, each a few lines.
8. **§A14** — cap the inbound share payload.
9. **§B5, §B6, §B7, §B8, §B11** — correct the five comments that teach something
   false. These are cheap and they are the ones a careful reader will catch.
10. **§E2** — the dead-prop sweep. Seven props, seven branches, six CSS rules,
    one mechanical pass.
11. **§D1, §D3, §D5, §D6** — the four extractions worth doing.
12. **§C1, §C2, §C4, §C5** — the consistency pass across the 22 tools. §D5 does
    a chunk of §C4 for free.
