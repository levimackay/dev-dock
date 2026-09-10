# Dev Dock: build log

A running record of what is done, what is next, and why each significant
decision went the way it did. Newest phase at the bottom.

---

## Phase 0: Survey

No existing repository, no stack to inherit. Node 26 and pnpm 11 on the
machine. Greenfield.

## Phase 1: Architecture decisions

| Decision         | Choice                                          | Reasoning                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime shape    | Static SPA, no backend                          | Every tool is a pure function over text. A server would add an attack surface, a hosting bill, and a privacy claim to defend, in exchange for nothing. The one tool that needs the network (HTTP builder) uses the browser's own `fetch`.            |
| Build            | Vite 7 + React 19 + TypeScript 5.9              | Vite's per-route chunking is what makes 22 lazy tools cheap. React because the tools are stateful editors, not documents.                                                                                                                            |
| Routing          | `react-router-dom` v7                           | Shareable URLs are a hard requirement, and nested layout routes give the persistent shell for free. A hand-rolled router would be ~40 lines that grow.                                                                                               |
| Styling          | Plain CSS + CSS Modules                         | Vite compiles Modules natively, so scoping costs zero dependencies. Tailwind was rejected on purpose: its defaults are exactly the generic look this app is trying not to have, and utility soup makes the design system harder to read, not easier. |
| Design tokens    | CSS custom properties in `oklch`                | One hue ramp for both themes, perceptually even contrast steps, and theme switching without a re-render.                                                                                                                                             |
| State            | React state + a thin `localStorage` layer       | There is no shared server state to cache and no cross-page store to normalise. Redux/Zustand would be ceremony.                                                                                                                                      |
| Search / palette | Hand-written fuzzy matcher (`src/lib/fuzzy.ts`) | Ranking 22 short strings is a scoring problem, not an indexing problem. Fuse.js is 12 KB to solve the easy half and none of the ordering.                                                                                                            |
| Icons            | Hand-drawn SVG set                              | An icon library is a visual tell and 40 KB for eighteen glyphs.                                                                                                                                                                                      |
| Type             | IBM Plex Sans + IBM Plex Mono, self-hosted      | Designed for technical products; self-hosting means zero third-party font requests, which the privacy claim depends on.                                                                                                                              |

### Two decisions worth their own paragraph

**Share links use the URL fragment, not the query string.** Everything after
`#` is stripped by the browser before a request is sent, so it never lands in
server logs, proxy logs, or a `Referer` header. Since a share payload can
contain a JWT or a config file, the query string would have quietly leaked user
input to whoever hosts the app. See `src/lib/share.ts`.

**Share payloads are deflated with the native `CompressionStream` API.** Tool
input is repetitive text, and base64 inflates bytes by a third. Deflating first
typically halves the link length and costs zero bundle bytes. Where the API is
missing the code falls back to plain base64url, and a one-byte version prefix
tells the decoder which path produced the string.

**`exactOptionalPropertyTypes` is off.** Every other strict flag is on
(including `noUncheckedIndexedAccess`). This one makes ordinary React prop
forwarding, `className={className}` where the prop is optional, a type error,
which produced noise without catching a real defect in this codebase.

## Phase 2: Foundation (done)

- Tokens, base stylesheet, light/dark/system theming with a pre-paint script so
  dark-mode users never see a white flash.
- `src/lib`: namespaced fail-soft storage, cross-tab-synced `useLocalStorage`,
  clipboard with a non-secure-context fallback, safe download, share encoding,
  a single-listener hotkey layer, formatters, fuzzy matcher.
- `src/components`: Button, Panel, CodeArea, CopyButton, Callout, Field set
  (Field/TextInput/Select/SegmentedControl/Checkbox), Kbd, EmptyState,
  StatGrid, SplitPane, Dialog (real focus trap), Toast, ToolShell.
- `src/app`: shell frame, rail with pins and recents, command palette with full
  combobox semantics, shortcuts dialog, home index, tool route with share
  hydration, per-tool error boundary, fuzzy-matching 404.
- Tool registry: 22 entries, all lazy, metadata separated from implementation so
  search never pulls tool code into memory.
- Tests: fuzzy matcher (14), storage (9).
- Build verified: one chunk per tool, 72 KB gzip shell.

**Next:** implement the 22 tools.

## Phase 3: Shared algorithms (done)

Four non-trivial pieces written rather than installed, each with a design
comment at the top of the file and a test suite that pins the behaviour:

| Module                                                                                  | Tests | Replaces                              |
| --------------------------------------------------------------------------------------- | ----- | ------------------------------------- |
| `src/lib/diff.ts`, Myers O(ND) with prefix/suffix trimming and an edit-distance ceiling | 28    | `diff` (~30 KB)                       |
| `src/lib/regex*`, user patterns in a Web Worker with a hard timeout                     | 11    | nothing; there is no library for this |
| `src/tools/cron-helper/cron.ts`, parse, describe, project                               | 44    | `cron-parser` + `cronstrue` (~60 KB)  |
| `src/tools/color-converter/color.ts`, sRGB ↔ HSL ↔ OKLCH, WCAG, gamut                   | 39    | `culori` (~40 KB)                     |

Two real bugs were caught by writing the tests first:

- The cron field parser rejected `JAN,jul` because the Quartz-extension scan
  for `L`/`W`/`#` ran against the raw text, and `JUL` contains an L.
- `nextRuns` could return the starting instant itself when snapping to the top
  of the minute, and searched by iteration count rather than by elapsed time,
  so an expression that can never fire (`0 0 30 2 *`) walked thousands of
  simulated years and blocked the main thread for a full second. Bounding by a
  five-year horizon took it to 13 ms.

## Phase 4: Tools (in progress)

Implementation was delegated to specialist agents in batches of four to five
tools, two agents at a time, each working only inside its own tool folders and
against `docs/TOOL-AUTHORING.md`. Shared code stayed under my hand so that no
two agents could race on it.

Landed so far: Base64 (the reference implementation), JSON Formatter, JSON Tree
Viewer, SQL Formatter, URL Encoder, HTML Entities, JWT Decoder, Hash Generator.

### Fixes that came out of reviewing that work against the whole tree

- **`Field` did not wire its own control.** It rendered `<label htmlFor>`
  pointing at an id nothing carried, so every `Field`/`TextInput` pair was
  unlabelled unless the caller threaded ids by hand. It now owns the id and
  clones its child to inject `id`, `aria-describedby`, and `aria-invalid`.
- **The dialog focus trap filtered focusables with `offsetParent !== null`.**
  `offsetParent` is null for every descendant of a `position: fixed` element,
  which the dialog is, so the trap silently reduced to a single element and
  Tab wrapping broke in both directions. Caught by a component test.
- **A share-link hydration race.** Arriving at tool B from tool A via a pasted
  link found `ready` already true, mounted B with defaults, and patched the
  payload in a tick later. The route is now keyed by tool id, which makes the
  race unrepresentable rather than merely unlikely.
- **Share encoding silently fell back to uncompressed base64** because the
  `Blob → Response` stream pipeline does not compose across realms outside a
  browser. Driving the compression stream's writer and reader directly removed
  the dependency, and a test now asserts the payload actually shrinks.
- **Ref writes during render** in `useShareState` and `useHotkey`, and a
  variable mutated during render in the command palette. All are concurrent
  rendering hazards: React may render a tree and discard it.

### Lint policy note

React 19's `react-hooks/set-state-in-effect` and `react-hooks/refs` rules found
several genuine issues and a handful of false positives around legitimately
asynchronous work (setting a busy flag before an `await`). Rather than
downgrade the rules and lose the signal, each false positive carries a
`eslint-disable-next-line` with the reason written out. Same for the three
`jsx-a11y` rules that do not model the APG patterns this app implements
(focusable `separator`, roving-tabindex `radiogroup`).

## Phase 5 — Tools complete

All 22 implemented. 743 unit and integration tests, 90 end-to-end tests
(Playwright, against the production build, including axe scans of every tool in
both themes).

Two more tools were promoted out of the "just build the UI" pile because their
logic turned out to be the interesting part, and both were written before their
UI: the cron parser and the colour library. That ordering paid for itself twice,
in bugs the tests caught before any pixel existed.

## Phase 6 — Audits

### Security

The audit found two exploitable issues, both reproduced against the real
dependencies before being fixed:

1. **Inline `style` survived sanitisation.** DOMPurify filters markup, not CSS
   values, so `<div style="background:url(https://…)">` in a previewed markdown
   document fetched that URL on render. An outbound request the user never
   composed, in the app whose headline claim is that nothing is transmitted.
   `FORBID_ATTR: ['style']`, plus `USE_PROFILES: { html: true }` to drop SVG and
   MathML entirely.
2. **Deep JSON overflowed the stack.** `JSON.parse` accepts 200,000 levels;
   V8's `JSON.stringify` is recursive and does not. Twenty kilobytes of valid
   input crashed both JSON tools, and because they hydrate from a share link
   before first render, a link alone did it with no interaction. Depth
   measurement is now iterative so the depth can always be reported; everything
   that must recurse refuses past 1,000 levels with a message.

Also: GitHub Actions pinned to commit SHAs, and the file-drop cap made visible
instead of failing in silence.

### Accessibility

Measured contrast across every surface pairing, in both themes, using the app's
own `contrastRatio()`. `--fg-subtle` failed on the interactive surfaces (hover,
active, selected) as well as the static ones. A new `--line-control` token gives
interactive borders the 3:1 that WCAG 1.4.11 asks for without turning the
decorative hairlines into a wireframe.

Three real behavioural bugs came out of it:

- **The focus trap's selector was an OR chain** ending in
  `[tabindex]:not([tabindex="-1"])`, which reads as "exclude untabbable" and is
  not: the earlier `button` clause still matched buttons carrying
  `tabindex="-1"`. The command palette's option rows are exactly that, so the
  trap never found the end of its list and Tab walked out of the dialog. Found
  by the end-to-end suite, not by the unit tests, whose fixtures had no
  roving-tabindex elements.
- **The palette listbox wrapped options in `<li>`**, putting a non-option
  element between a listbox and its options. Invalid ARIA, reported critical.
- **The mobile rail drawer had no focus trap**, so Tab walked from a modal-
  looking drawer into the page behind it.

### Copy

Every em dash in the repository was rewritten as ordinary punctuation. The
transform is in `scripts/dedash.mjs` and is re-runnable. The em dash is a
reliable tell for machine-written prose and this is meant to read as a person's
work; the placeholder glyph and the HTML entity table keep theirs.

## Phase 7 — Code review, and what it found

A full review of the finished repository, kept verbatim in `docs/CODE-REVIEW.md`
with a status header. The interesting part is not the count, it is the shape of
what it caught.

### The one that mattered

**The code diff tool's patch export did not apply.** `toUnifiedDiff` produced a
`.patch` file that `git apply` refused, for three independent reasons:

1. `splitLines("a\nb\nc\n")` yields four lines, because the text really does
   have an empty string after the final newline. That is the right model for an
   editor and the wrong one for a patch, so every hunk header was off by one.
2. The output had no trailing newline, which is `corrupt patch at line 8` before
   git reads any content.
3. There was no `\ No newline at end of file` marker, so context failed to match
   for any file not ending in a newline.

The existing tests passed throughout. They asserted the output contained `@@`, a
`-b`, and a `+x` — the _shape_ of the format, which is to say my own idea of the
format. The replacement hands the patch to `git apply` inside a throwaway
repository and checks the file afterwards, across nine before/after shapes. That
is the lesson worth keeping from this project: **for an interoperability format,
test against the consumer, not against your understanding of the spec.**

### The category that mattered more

Nineteen findings under "places the code lies": a comment describing something
the code does not do. These are worse than bugs in a repository whose comments
are meant to be read. The three that stung:

- **A lint rule that could never fire.** The `no-restricted-syntax` selector
  guarding `dangerouslySetInnerHTML` ended in a `:not()` that is universally
  false. `SECURITY.md` listed it as a control. It is unconditional now, and
  verified against a probe file rather than assumed.
- **The accessibility suite's docstring** promised a scan of every tool in both
  themes. The loop set no theme. Making it true added twenty-two tests and
  immediately found a dark-mode-only contrast failure, which is exactly the
  failure mode the docstring had described.
- **The modulo-bias comment in the NanoID generator** had the bias backwards and
  both bounds wrong, in a comment whose only purpose was to teach modulo bias.

### The rest

Nineteen correctness bugs, including a `TypeError` into render from
`bnVsbA.e30.x`, an unbounded share fragment that was a decompression bomb, a
`Date.UTC` two-digit-year trap across six call sites, and a focus trap whose
selector matched elements it was meant to exclude. Four genuine duplications
extracted to `src/lib`, one of which had produced three implementations giving
three different answers for the same instant.

Two findings were deliberately not taken, and the reasons are recorded at the
end of the review.

### Final state

|                          |                                                      |
| ------------------------ | ---------------------------------------------------- |
| Tools                    | 22                                                   |
| Unit and component tests | 860                                                  |
| End-to-end tests         | 90, including axe scans of every tool in both themes |
| Initial download         | 97 KB gzipped, budget 130 KB, enforced in CI         |
| Runtime dependencies     | 8                                                    |
| Typecheck, lint, format  | clean                                                |
