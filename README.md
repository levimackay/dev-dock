# Dev Dock

**Twenty-two developer utilities that run entirely in your browser.**

Live at **[levimackay.github.io/dev-dock](https://levimackay.github.io/dev-dock/)**.

The formatters, decoders, converters, and diff tools you reach for a dozen times
a day, in one keyboard-driven workbench. No accounts, no uploads, no tracking,
and, with a single labelled exception, no network requests at all.

```bash
pnpm install
pnpm dev
```

---

## Why this exists

The tools in here already exist a hundred times over on the web. Most of those
sites post your input to a server, wrap it in three ad slots, and load 800 KB of
JavaScript to pretty-print some JSON. Pasting a JWT into one is a small security
incident.

Dev Dock is the version where that is not true. Every transformation happens in
the page. The shell is about 97 KB gzipped and CI fails the build if it passes
130; each tool is a separate chunk that only downloads when you open it, and
most are under 7 KB. The SQL formatter is the one heavy exception, at 74 KB,
because formatting twenty SQL dialects is a real parser. There is nothing to
sign into and nothing to send.

## The tools

| Data             | Encoding       | Text            |
| ---------------- | -------------- | --------------- |
| JSON Formatter   | Base64         | Text Diff       |
| JSON Tree Viewer | URL Encoder    | Code Diff       |
| SQL Formatter    | HTML Entities  | Regex Tester    |
|                  | JWT Decoder    | Case Converter  |
|                  | Hash Generator | Text Statistics |
|                  |                | Markdown Editor |

| Time                | Web                  | Generate       |
| ------------------- | -------------------- | -------------- |
| Unix Timestamp      | HTTP Request Builder | UUID Generator |
| Date/Time Converter | URL Parser           | Test Data      |
| Cron Helper         | Color Converter      |                |

## Using it

It is built for the keyboard first.

| Key                               | Does                                          |
| --------------------------------- | --------------------------------------------- |
| <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> | Command palette, search every tool and action |
| <kbd>/</kbd>                      | Same, from anywhere you are not typing        |
| <kbd>?</kbd>                      | The full shortcut list                        |
| <kbd>⌘B</kbd>                     | Show or hide the tool rail                    |
| <kbd>⌘⇧L</kbd>                    | Cycle light, dark, and system themes          |
| <kbd>⌘D</kbd>                     | Pin the current tool to the rail              |
| <kbd>⌘⇧S</kbd>                    | Copy a share link that restores your input    |
| <kbd>⌘⇧C</kbd>                    | Copy the current tool's output                |

Pinned tools, recent tools, split-pane positions, and your theme persist in
`localStorage`. Tool _input_ never does, closing the tab loses it, which is the
right default for something people paste credentials into.

### Share links

<kbd>⌘⇧S</kbd> copies a URL that reproduces exactly what you were looking at.
The payload lives in the URL **fragment** (`#s=…`), which browsers strip before
sending a request, so it never reaches a server log, a proxy, or a `Referer`
header. It is deflate-compressed and base64url-encoded, which is encoding, not
encryption. Anyone holding the link can read it, and the app says so when you
copy one.

## Development

Requires Node 22+ and pnpm 9+.

```bash
pnpm install          # install dependencies
pnpm dev              # dev server on http://localhost:5183
pnpm build            # typecheck and build to dist/
pnpm preview          # serve the production build

pnpm test             # unit and component tests
pnpm test:watch       # the same, in watch mode
pnpm test:coverage    # with a coverage report
pnpm e2e              # Playwright, against the production build
pnpm e2e:ui           # the same, in Playwright's UI mode

pnpm lint             # ESLint
pnpm format           # Prettier, writing
pnpm verify           # everything CI runs, in one command
```

First run of the end-to-end suite needs the browser binary:

```bash
pnpm exec playwright install chromium
```

### Layout

```
src/
  app/          the shell: routing, rail, command palette, theming
  components/   the shared UI vocabulary, 14 components, no more
  lib/          framework-free utilities and algorithms
  styles/       design tokens and the base stylesheet
  tools/
    registry.ts   the single source of truth for what exists
    <tool-id>/    one folder per tool: pure logic, tests, and UI
```

`docs/ARCHITECTURE.md` explains how the pieces fit and why each decision went
the way it did. `docs/TOOL-AUTHORING.md` is the contract every tool follows.
`SECURITY.md` is the threat model.

### Adding a tool

1. Create `src/tools/<id>/` with three files: `<name>.ts` (pure logic),
   `<name>.test.ts`, and `<Name>Tool.tsx` (the UI, default-exported).
2. Add one entry to `src/tools/registry.ts`.

That is the whole checklist. The rail, the home page, the command palette, and
the 404 suggestions all read from the registry, so there is no second list to
update. Read `src/tools/base64/` first. It is the reference implementation.

## Deploying

The build output is a folder of static files. Any host will serve it.

**Two things every deployment needs:**

1. **An SPA fallback.** Unknown paths must serve `index.html`, or a deep link
   like `/t/base64` 404s on refresh.
2. **Security headers.** See `SECURITY.md` for the full set and why each is
   there.

`deploy/` has ready-made configuration for each target:

| Target                     | Files                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Netlify / Cloudflare Pages | `deploy/_headers`, `deploy/_redirects` → copy into `public/`                                                 |
| Vercel                     | `deploy/vercel.json` → copy to the repo root                                                                 |
| Nginx                      | `deploy/nginx.conf`                                                                                          |
| Docker                     | `deploy/Dockerfile`, multi-stage, ships nginx with no Node in the runtime image                              |
| GitHub Pages               | `.github/workflows/pages.yml`, deploys on every push to `main`; this is where the live site above comes from |

```bash
# Docker
docker build -f deploy/Dockerfile -t dev-dock .
docker run -p 8080:80 dev-dock
```

## How it is tested

| Layer      | Count          | What it covers                                                                                                                                                                       |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit       | 860            | Every pure logic module. Error _messages_ are asserted, because a message is the contract between a tool and a confused user.                                                        |
| Component  | included above | The shell behaviour that lives in wiring rather than in a function: the focus trap, the command palette's combobox semantics, the share round trip.                                  |
| End-to-end | 90             | Run against the production build. Palette navigation, deep links, theme persistence, pinning, the mobile drawer, and an axe accessibility scan of every tool in both light and dark. |

Two things worth knowing about that table.

The unified-diff output is checked by handing the patch to `git apply` in a
throwaway repository and reading the file back, not by asserting on the shape of
the string. The earlier tests did the latter, passed the whole time, and the
patch did not apply.

Line coverage is about 56%, which is a misleading number in both directions. The
logic modules run 83% to 100%; the React files pull the average down because
they are covered end-to-end instead, where the coverage tool cannot see them.
`docs/ARCHITECTURE.md` explains why that split is deliberate.

## Contributing

Pull requests are welcome. `pnpm verify` must pass, which is the same set of
checks CI runs. New tools follow `docs/TOOL-AUTHORING.md`; new dependencies need
a line in `PROGRESS.md` explaining what they replace and why writing it by hand
was worse.

## Licence

MIT. See `LICENSE`.
