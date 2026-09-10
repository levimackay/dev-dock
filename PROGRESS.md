# Dev Dock — build log

A running record of what is done, what is next, and why each significant
decision went the way it did. Newest phase at the bottom.

---

## Phase 0 — Survey

No existing repository, no stack to inherit. Node 26 and pnpm 11 on the
machine. Greenfield.

## Phase 1 — Architecture decisions

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
forwarding — `className={className}` where the prop is optional — a type error,
which produced noise without catching a real defect in this codebase.

## Phase 2 — Foundation (done)

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

## Phase 3 — Shared algorithms (done)

Four non-trivial pieces written rather than installed, each with a design
comment at the top of the file and a test suite that pins the behaviour:

| Module                                                                                   | Tests | Replaces                              |
| ---------------------------------------------------------------------------------------- | ----- | ------------------------------------- |
| `src/lib/diff.ts` — Myers O(ND) with prefix/suffix trimming and an edit-distance ceiling | 28    | `diff` (~30 KB)                       |
| `src/lib/regex*` — user patterns in a Web Worker with a hard timeout                     | 11    | nothing; there is no library for this |
| `src/tools/cron-helper/cron.ts` — parse, describe, project                               | 44    | `cron-parser` + `cronstrue` (~60 KB)  |
| `src/tools/color-converter/color.ts` — sRGB ↔ HSL ↔ OKLCH, WCAG, gamut                   | 39    | `culori` (~40 KB)                     |

Two real bugs were caught by writing the tests first:

- The cron field parser rejected `JAN,jul` because the Quartz-extension scan
  for `L`/`W`/`#` ran against the raw text, and `JUL` contains an L.
- `nextRuns` could return the starting instant itself when snapping to the top
  of the minute, and searched by iteration count rather than by elapsed time —
  so an expression that can never fire (`0 0 30 2 *`) walked thousands of
  simulated years and blocked the main thread for a full second. Bounding by a
  five-year horizon took it to 13 ms.

## Phase 4 — Tools (in progress)

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
  `offsetParent` is null for every descendant of a `position: fixed` element —
  which the dialog is — so the trap silently reduced to a single element and
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
