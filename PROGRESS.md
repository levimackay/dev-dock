# Dev Dock — build log

A running record of what is done, what is next, and why each significant
decision went the way it did. Newest phase at the bottom.

---

## Phase 0 — Survey

No existing repository, no stack to inherit. Node 26 and pnpm 11 on the
machine. Greenfield.

## Phase 1 — Architecture decisions

| Decision | Choice | Reasoning |
| --- | --- | --- |
| Runtime shape | Static SPA, no backend | Every tool is a pure function over text. A server would add an attack surface, a hosting bill, and a privacy claim to defend, in exchange for nothing. The one tool that needs the network (HTTP builder) uses the browser's own `fetch`. |
| Build | Vite 7 + React 19 + TypeScript 5.9 | Vite's per-route chunking is what makes 22 lazy tools cheap. React because the tools are stateful editors, not documents. |
| Routing | `react-router-dom` v7 | Shareable URLs are a hard requirement, and nested layout routes give the persistent shell for free. A hand-rolled router would be ~40 lines that grow. |
| Styling | Plain CSS + CSS Modules | Vite compiles Modules natively, so scoping costs zero dependencies. Tailwind was rejected on purpose: its defaults are exactly the generic look this app is trying not to have, and utility soup makes the design system harder to read, not easier. |
| Design tokens | CSS custom properties in `oklch` | One hue ramp for both themes, perceptually even contrast steps, and theme switching without a re-render. |
| State | React state + a thin `localStorage` layer | There is no shared server state to cache and no cross-page store to normalise. Redux/Zustand would be ceremony. |
| Search / palette | Hand-written fuzzy matcher (`src/lib/fuzzy.ts`) | Ranking 22 short strings is a scoring problem, not an indexing problem. Fuse.js is 12 KB to solve the easy half and none of the ordering. |
| Icons | Hand-drawn SVG set | An icon library is a visual tell and 40 KB for eighteen glyphs. |
| Type | IBM Plex Sans + IBM Plex Mono, self-hosted | Designed for technical products; self-hosting means zero third-party font requests, which the privacy claim depends on. |

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
