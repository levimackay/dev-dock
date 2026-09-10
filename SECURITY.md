# Security

Dev Dock is a static single-page application. There is no backend, no database,
no account system, and no analytics. Everything below follows from that, and
from the fact that **every input is hostile**: the tools exist to be pasted
into, often with content the user did not write.

## Reporting a vulnerability

Open a GitHub security advisory on the repository (Security → Advisories →
Report a vulnerability) rather than a public issue. Please include a proof of
concept if you have one.

## Threat model

The assets worth protecting are:

1. **The user's input.** A JWT, a connection string in a SQL query, a
   `.env`-shaped blob pasted into the diff tool. These are frequently secrets.
2. **The user's browser session.** A stored XSS in a tool that renders
   user-supplied markup would execute on the app's own origin.
3. **The user's trust in the "nothing leaves your browser" claim.** A single
   unlabelled outbound request breaks it permanently.

The attacker is assumed to be (a) whoever authored the content the user pastes,
and (b) whoever sends the user a link.

## Design decisions

### Nothing is transmitted

Tool input is processed in the page. The app makes no telemetry, error
reporting, or analytics requests. Fonts are self-hosted (`@fontsource`) rather
than loaded from Google Fonts, so there is no third-party request that could
carry a referrer.

**The one exception** is the HTTP Request Builder, whose entire purpose is to
issue a request the user composed. It is marked `network: true` in the tool
registry, wears a visible `network` badge in its toolbar, and is counted on the
home page. Its target, method, headers, and body all come from the user.

### Share links use the URL fragment

`#s=<payload>` rather than `?s=<payload>`. Browsers strip everything after `#`
before sending a request, so the payload never reaches:

- the server's access log
- an intermediate proxy or CDN log
- the `Referer` header sent to any third party

A query string would have leaked pasted secrets to whoever hosts the app. The
payload is deflated and base64url-encoded — that is **encoding, not
encryption**, and the UI says so when a link is copied.

The JWT decoder additionally **excludes the signing secret from share state**;
it is held in ordinary component state that never reaches the URL.

### Untrusted HTML is sanitised, never trusted

The Markdown tool is the only place where user input becomes DOM. It renders
through `marked` and then **DOMPurify**, with:

- `dangerouslySetInnerHTML` used exactly once, immediately downstream of
  `DOMPurify.sanitize`
- a hook that forces `rel="noopener noreferrer"` and `target="_blank"` on links
- a URL scheme allowlist that drops `javascript:`, `data:` (except images), and
  `vbscript:` hrefs
- `ALLOW_DATA_ATTR: false` so `data-*` cannot be used to smuggle payloads into
  code that later reads them

The HTML Entities tool decodes with an explicit table and numeric-reference
parsing. It deliberately does **not** use the common
`el.innerHTML = input; return el.textContent` trick, which parses attacker
markup in the live document.

ESLint fails the build on `eval`, `new Function`, `document.write`, and flags
every `dangerouslySetInnerHTML`.

### Regular expressions run in a Web Worker

User-supplied patterns can backtrack catastrophically — `(a+)+$` against a few
dozen characters is exponential — and JavaScript's regex engine cannot be
interrupted. Running the match on the main thread means an unrecoverable frozen
tab.

The Regex Tester posts the pattern to a dedicated worker and terminates it after
a timeout. The main thread stays responsive and the user gets an explanation
naming nested quantifiers as the likely cause.

### Every parser is defensive

`JSON.parse`, `new RegExp`, `new URL`, `atob`, `decodeURIComponent`, and
`new Date` all throw or return garbage on hostile input. Every call is wrapped,
and failures produce a message naming the position and the likely cause. No tool
is permitted to throw into the render path; each is additionally wrapped in an
error boundary so a bug in one tool cannot take down the app.

### Bounded work

Unbounded input is a denial-of-service against the user's own tab. Caps are
applied and **stated in the UI** wherever they bite:

| Limit                                                | Where                                   |
| ---------------------------------------------------- | --------------------------------------- |
| Edit-distance ceiling, then a coarse whole-file diff | Text and code diff                      |
| Regex execution timeout                              | Regex tester                            |
| Match count cap                                      | Regex tester                            |
| Rendered-node cap with a "show all" escape           | JSON tree                               |
| File size cap                                        | Hash generator, Base64, any drop target |
| Five-year search horizon                             | Cron next-run projection                |
| Gutter line cap                                      | All editors                             |

Silent truncation is treated as a bug.

### Storage

`localStorage` holds preferences only: theme, pinned tool ids, recent tool ids,
and split-pane ratios. Tool _input_ is never persisted — closing the tab loses
it, which is the correct default for a tool people paste credentials into.

All keys are namespaced under `devdock:`, every read is validated against an
expected shape before use, and every read and write is wrapped because private
browsing modes throw. "Clear all local data" is a first-class command in the
palette.

### Downloads

`downloadText` forces a benign MIME type from an allowlist and sanitises the
filename (path separators, control characters, and leading dots are stripped).
A `text/html` blob download that the user later opens would run as script; the
allowlist makes that unreachable.

### Clipboard

Reads are never automatic. The app writes to the clipboard only on an explicit
click or keystroke, and reads only when the user activates a paste control.

### Supply chain

Eight runtime dependencies: React, React DOM, React Router, `marked`,
`dompurify`, `sql-formatter`, and two self-hosted font packages. Everything
else — diff, cron, colour, hashing, fuzzy search, icons — is written in this
repository rather than installed, which is both fewer bytes and fewer people
who can push code into the build.

`pnpm audit --prod --audit-level high` fails CI. CodeQL runs on every pull
request and weekly. Dependabot proposes grouped updates. `pnpm install
--frozen-lockfile` in CI means the resolved tree is the reviewed tree, and only
`esbuild` is allowlisted to run an install script.

## Recommended deployment headers

The app functions without these, but a deployment should set them. `deploy/`
contains ready-made configuration for Netlify, Vercel, and Nginx.

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src *; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Two of those need explaining:

- **`script-src 'self' 'unsafe-inline'`** — the theme is applied by a small
  inline script in `index.html` before first paint, to avoid a white flash for
  dark-mode users. Removing `'unsafe-inline'` requires replacing that script
  with a nonce or hash injected at deploy time; if your host can do that, do it.
- **`connect-src *`** — required by the HTTP Request Builder, which exists to
  call arbitrary endpoints. If you deploy Dev Dock without that tool, tighten
  this to `'self'`.

## Known limitations

- **Share links are readable by anyone holding them.** They are encoded, not
  encrypted. The UI says so.
- **The HTTP Request Builder is bound by CORS**, because it is a browser. It
  cannot reach an endpoint that does not opt in, and it says so rather than
  failing mysteriously. It also cannot set forbidden headers such as `Host`,
  `Origin`, or `Cookie`.
- **JWT verification covers HMAC only.** RSA and ECDSA verification needs a
  public key and a different code path; the tool says so instead of implying
  a token is unverified when it merely is not checkable here.
- **MD5 and SHA-1 are offered and labelled as broken** for security purposes.
  They remain useful for checksums and for comparing against legacy systems.
