# Writing a tool

Every tool in Dev Dock is a folder under `src/tools/<id>/` containing three
things and nothing else:

```
src/tools/<id>/
  <name>.ts          pure logic — no React, no DOM
  <name>.test.ts     vitest unit tests for that logic
  <Name>Tool.tsx     the UI, default-exported
```

`src/tools/base64/` is the reference implementation. Read it before writing a
new one.

## The rules

1. **Logic is pure and separate.** Anything that transforms text lives in the
   `.ts` file as exported functions taking data and returning data. The `.tsx`
   file wires state to those functions. This is what makes the tests fast and
   the tools reviewable.

2. **Tests cover behaviour, not lines.** Every exported function gets tests for
   the happy path, the empty input, and at least two ways real input goes wrong.
   Error *messages* are part of the contract — assert on them.

3. **Never crash on user input.** All input is untrusted. `JSON.parse`,
   `new RegExp`, `new URL`, `atob`, and `new Date` all throw. Catch, and return
   a message that says what is wrong and where.

4. **Use the shared components.** `Panel`, `CodeArea`, `Button`, `CopyButton`,
   `Callout`, `EmptyState`, `StatGrid`, `Field`/`TextInput`/`Select`/
   `SegmentedControl`/`Checkbox`, `Kbd`, `SplitPane`. Do not invent a new box,
   a new button, or a new label style. If something genuinely does not exist,
   add it to `src/components/` so every tool gets it.

5. **Use the shared layout.** `ToolShell` is the frame. `OptionsBar` +
   `OptionGroup` is the settings row. `TwoPane` is input-left/output-right;
   `PaneStack` is for tools that are not shaped that way.

6. **State goes through `useShareState`.** One flat object of strings, booleans,
   numbers, and string arrays, with a `shapeValidator`. That is what makes the
   Share button work with no extra code. Keep the shape small — it ends up in a
   URL.

7. **Empty states do work.** "No input yet" is not an empty state. Say what to
   paste, what the tool will do with it, or offer a sample. Every tool that can
   be demonstrated should have a **Sample** button in its toolbar.

8. **Errors name the position.** "Invalid JSON" is useless. "Unexpected `}` at
   line 4, column 12 — the previous property has a trailing comma" is a tool.

9. **Copy buttons everywhere a value is produced**, including individual rows in
   a results table where that is the thing someone wants.

10. **Accessibility is not optional.** Every input has a label (visible, or via
    the `label` prop on `CodeArea`). Every icon-only button has `aria-label`.
    Results that change in response to typing live in a region a screen reader
    is told about — `Callout` has a `live` prop for exactly this.

11. **Nothing hits the network** except `http-client`, which is flagged
    `network: true` in the registry.

12. **No new dependencies** without a note in `PROGRESS.md` explaining what it
    replaces and why hand-writing it was worse.

## The layout recipe

```tsx
export default function ThingTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const result = useMemo(() => compute(state), [state])

  return (
    <ToolShell actions={<>{/* Sample, Clear, tool-specific verbs */}</>}>
      <OptionsBar>{/* SegmentedControls, Checkboxes, Selects */}</OptionsBar>
      <TwoPane
        storageKey="thing"
        input={<Panel label="Input" status={…}><CodeArea … /></Panel>}
        output={<Panel label="Output" actions={<CopyButton value={…} />}>…</Panel>}
      />
    </ToolShell>
  )
}
```

## Performance

Computation runs on every keystroke. That is fine for anything linear on a few
hundred kilobytes. It is *not* fine for:

- user-supplied regular expressions (catastrophic backtracking — must be run
  with a timeout, see `src/lib/regexWorker.ts`)
- quadratic diff on large inputs (cap the input, say so in the UI)
- rendering a tree of 100k nodes (virtualise or collapse by default)

When you cap something, tell the user in the UI. Silent truncation is a bug.

## Style

- Comments explain *why*, and are worth writing when the reason is not obvious
  from the code. Do not narrate what the next line does.
- No `any`. No `as` casts to silence the compiler; fix the type.
- Prefer a boring 20-line function to a clever 6-line one.
