# Architecture

This document explains how Dev Dock is put together and, more usefully, _why_
each decision went the way it did. It is written to be read start to finish.

---

## 1. The shape of the thing

Dev Dock is a **static single-page application**. There is no server-side
component at all: `pnpm build` emits a folder of files that any static host can
serve.

That falls out of one observation. Every tool in the app is a pure function from
text to text. Formatting JSON, decoding a JWT, diffing two files, computing a
SHA-256, none of it needs anything the browser does not already have. A backend
would add a hosting bill, a deployment surface, a rate limit, an outage mode,
and a privacy claim to defend, in exchange for capabilities the app does not
use.

The one tool that genuinely needs the network, the HTTP Request Builder,
uses the browser's own `fetch`, which means it inherits the browser's CORS
rules. That is a real constraint (see §8) and the tool says so rather than
pretending otherwise.

```
┌──────────────────────────────── the browser tab ────────────────────────────┐
│                                                                             │
│  index.html ──► main.tsx ──► PreferencesProvider ──► ToastProvider           │
│                                    │                                        │
│                              BrowserRouter                                  │
│                                    │                                        │
│                    ┌───────────────┴──────────────┐                         │
│                 AppShell                      (routes)                      │
│              ┌─────┴─────┐                        │                         │
│           Rail       CommandPalette          ToolPage                       │
│                                                   │                         │
│                                       ShareContext + ToolChrome             │
│                                                   │                         │
│                                        lazy(() => import(tool))             │
│                                                   │                         │
│                                              ToolShell                      │
│                                          ┌────────┴────────┐                │
│                                     OptionsBar          TwoPane             │
│                                                     ┌───────┴──────┐        │
│                                                  Panel          Panel       │
│                                               (CodeArea)     (CodeArea)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Directory layout

```
src/
  main.tsx            entry: providers, router, fonts, global CSS
  app/                the shell, everything that is not a tool
    App.tsx           route table
    AppShell.tsx      header + rail + outlet, global hotkeys
    Rail.tsx          the tool list, pins, recents
    CommandPalette/   ⌘K, with full combobox semantics
    ToolPage.tsx      route wrapper: share hydration, chrome, error boundary
    HomePage.tsx      the catalogue
    preferences.tsx   theme / pins / recents context
  components/         the shared UI vocabulary, 14 components, no more
  lib/                framework-free utilities and algorithms
  styles/             tokens.css and base.css. Everything else is a CSS Module.
  tools/
    registry.ts       the single source of truth for what exists
    types.ts
    useShareState.ts  URL-shareable tool state
    shared/           layout primitives used by most tools
    <tool-id>/        one folder per tool: logic + tests + UI
```

The rule that keeps this navigable: **a tool folder never imports from another
tool folder** (with one deliberate exception, the JSON tree viewer reuses the
formatter's error describer rather than owning a second copy). Anything two
tools need moves to `src/lib` or `src/components`.

## 3. The registry, and why metadata is separate from code

`src/tools/registry.ts` holds an array of 22 entries, each with an id, a name, a
tagline, a category, search keywords, and a `lazy()` component.

Two things fall out of that:

**Code splitting is automatic.** Because every component is `lazy()`, Rollup
emits one chunk per tool. The initial download is the shell plus whichever tool
you opened. Opening the app does not download a SQL formatter you never use.

**Search never pays for code.** The command palette ranks all 22 tools against
your query using only the plain-data half of the registry. Nothing is imported,
parsed, or evaluated until you press Enter. This is the whole reason the
metadata and the implementation live in different objects.

Adding a tool is one registry entry plus one folder. There is no other list to
update, the rail, the home page, the palette, and the 404 suggestions all read
from the same array.

## 4. State

There are exactly three kinds of state, and each has one home.

| Kind                               | Where it lives                         | Why                                                                        |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Tool input and options             | `useShareState` inside the tool        | It is per-tool and short-lived. It is also the thing a share link encodes. |
| Preferences (theme, pins, recents) | `PreferencesProvider` + `localStorage` | Global, tiny, and must survive a reload.                                   |
| Everything else                    | plain `useState`                       | It is not shared and not persisted.                                        |

No Redux, no Zustand, no React Query. There is no server state to cache, no
normalised entity graph, and no cross-page store. A global state library here
would be ceremony with a bundle cost.

### `useShareState`

A tool declares one flat state object and gets three things at once: React
state, hydration from an inbound `#s=` link, and registration as the source the
Share button reads.

The ordering matters and is easy to get wrong. `ToolPage` decodes the URL
fragment **before** mounting the tool, and renders a skeleton until it knows the
answer. The obvious alternative, mount with defaults, patch when the decode
resolves, has a race: anything typed in the intervening tick gets clobbered.
Blocking for one microtask is simpler and correct.

## 5. Styling

Plain CSS with **CSS Modules**, which Vite compiles natively. No CSS-in-JS, no
Tailwind.

Tailwind was rejected deliberately. Its defaults, the spacing scale, the
shadow ramp, the `rounded-lg` on everything, are precisely the look this app is
trying not to have, and utility strings make a design system harder to read, not
easier. What the app needs is a small vocabulary of tokens that everything obeys,
and that is what `src/styles/tokens.css` is.

### Tokens

Every colour is authored in **`oklch`**. This is not decoration:

- Light and dark are the same hue ramp at different lightness, so they cannot
  drift apart.
- Perceptual uniformity means a "one step darker" border actually looks one step
  darker at every hue. In sRGB hex it does not.
- `color-mix(in oklab, …)` composes states (hover, quiet backgrounds) from the
  base tokens instead of hardcoding a second colour.

Theme switching is an attribute on `<html>`, so it costs no React render. An
inline script in `index.html` applies the stored theme before first paint, which
is the only way to avoid a white flash for dark-mode users.

### The visual language

One conceit, applied without exception: **a machinist's workbench**. A fixed
frame with a work surface clamped inside it.

- Regions are separated by **hairline rules**, never by shadow or floating
  cards. The only shadow in the app is on modal overlays.
- Radii are 2-5px. Nothing is pill-shaped except actual pills.
- **Two type roles.** IBM Plex Sans carries language; IBM Plex Mono carries
  data, values, keycaps, and chrome labels. If a string is a number, a path, a
  digest, or a machine's own output. It is mono. That single rule does most of
  the work of making the app look designed.
- Density is high. This is an instrument panel; the value of the screen is how
  much of the problem fits on it.
- Colour is committed, not distributed: a warm neutral ground with one accent
  (vermillion) and three semantic colours. Most screens are almost achromatic.

## 6. The component vocabulary

Fourteen components, and tools are not permitted to invent a fifteenth without
adding it here. The important ones:

- **`Panel`**: the only container. Every region in every tool is one. This is
  the single largest reason 22 independently written tools look like one product.
- **`CodeArea`**: a plain `<textarea>` with a synced line-number gutter and
  tab-to-indent. Deliberately not CodeMirror or Monaco: those are 300 KB to
  1 MB for syntax colouring that none of these tools need to do their job.
- **`ToolShell`**: the toolbar. The identity half (name, tagline, pin, share)
  comes from route context; the tool contributes only its own actions. A tool
  _cannot_ render its title differently, because it never renders its title.
- **`Dialog`**: a real focus trap: focus in on open, restored on close, Tab
  wrapping, Escape, `inert` on the app root, scroll lock.
- **`SplitPane`**: Pointer Events with capture (so a fast drag never detaches)
  and a keyboard-operable `role="separator"`.

## 7. The algorithms worth reading

Four pieces are written from scratch rather than installed. Each has a long
comment at the top of its file explaining the method.

| File                                 | What it is                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/diff.ts`                    | Myers' O(ND) sequence alignment, with common prefix/suffix trimming and an edit-distance ceiling, plus line, word, and unified-patch wrappers. |
| `src/lib/fuzzy.ts`                   | Subsequence matching with a bonus structure (prefix, word boundary, camelCase, consecutive runs) that produces the ranking, not the matching.  |
| `src/tools/cron-helper/cron.ts`      | A cron parser, English describer, and schedule projector, including the either/both day-field rule that most hand-rolled cron code gets wrong. |
| `src/tools/color-converter/color.ts` | sRGB ↔ HSL ↔ OKLCH, WCAG contrast, gamut detection. The OKLCH chain is the interesting half.                                                   |

In each case the library alternative was 12-60 KB, and the thing being replaced
is 150-300 readable lines. That trade only works because they are all
well-specified problems with test vectors; it would be a bad trade for, say, a
Markdown parser, which is why `marked` is a dependency.

## 8. Known constraints

- **CORS bounds the HTTP Request Builder.** It is a browser, so it can only
  reach endpoints that opt in, and it cannot set `Host`, `Origin`, or `Cookie`.
  The tool detects the CORS failure mode specifically and explains it.
- **JWT verification is HMAC only.** RSA/ECDSA needs a public key and a
  different code path.
- **Timezone conversion uses `Intl`,** so the tz database is the browser's, not
  a bundled copy. That is smaller and always current, but it means output can
  differ marginally between browsers on a very recently changed zone.
- **Regex safety depends on Web Workers.** Where `Worker` is unavailable the
  runner falls back to inline execution, which can still hang on a pathological
  pattern. That path exists for jsdom under test and is not shipped to a browser.

## 9. Testing strategy

Three layers, each testing something the others cannot.

**Unit (vitest, jsdom).** Every `.ts` logic file. These are the bulk of the
suite and they run in about a second. Error _messages_ are asserted, because a
message is the contract between the tool and a confused user.

**Component (vitest + Testing Library).** The shell pieces where behaviour lives
in the wiring rather than in a function: the focus trap, the palette's roving
`aria-activedescendant`, the share round trip.

**End-to-end (Playwright).** Run against the **production build**, not the dev
server, because the failures worth catching, a lazy chunk that does not load, a
minified worker, a base-path mistake, are invisible to the dev middleware.
Coverage is the critical paths: palette navigation, deep links, theme
persistence, pinning, and the mobile drawer.

## 10. What is deliberately not here

- A backend, an account system, or a database.
- A UI framework (Material, Chakra, shadcn) or an icon library.
- A global state manager.
- A code editor component.
- Any analytics or error reporting.
- Service-worker offline caching. It would be genuinely useful and is the
  obvious next addition; it is out because a stale cached shell serving a stale
  chunk is a support burden, and shipping it correctly means versioned cache
  invalidation and an update prompt.
