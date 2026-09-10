import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { SegmentedControl, TextInput } from '@/components/Field'
import { useToast } from '@/components/Toast'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { copyText } from '@/lib/clipboard'
import styles from './ColorConverterTool.module.css'
import {
  formatHsl,
  formatOklch,
  formatRgb,
  gradeContrast,
  hslToRgb,
  isOutOfSrgbGamut,
  nearestNamed,
  parseColor,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
  buildRamp,
  type Hsl,
  type Oklch,
  type Rgb,
} from './color'

interface State {
  color: string
  compareColor: string
  model: 'rgb' | 'hsl' | 'oklch'
}

const DEFAULTS: State = { color: 'oklch(0.7 0.15 250)', compareColor: '#ffffff', model: 'oklch' }
const isState = shapeValidator<State>({ color: 'string', compareColor: 'string', model: 'string' })

const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }

export default function ColorConverterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const parsed = parseColor(state.color)
  const rgb = parsed?.rgb ?? BLACK
  const hsl = rgbToHsl(rgb)
  const oklch = rgbToOklch(rgb)
  const outOfGamut = isOutOfSrgbGamut(oklch)
  const named = nearestNamed(rgb)

  const comparedParsed = parseColor(state.compareColor)
  const compareRgb = comparedParsed?.rgb ?? WHITE
  const verdict = gradeContrast(rgb, compareRgb)

  const setRgb = (next: Rgb) => patch({ color: formatRgb(next) })
  const setHsl = (next: Hsl) => patch({ color: formatHsl(next) })
  const setOklch = (next: Oklch) => patch({ color: formatOklch(next) })

  const ramp = buildRamp(rgb)
  const naiveRamp = naiveHslRamp(rgb)

  return (
    <ToolShell
      actions={
        <Button size="sm" variant="ghost" onClick={() => patch(DEFAULTS)}>
          Sample
        </Button>
      }
    >
      <PaneStack>
        <Panel label="Color" bodyClassName={styles.section}>
          <div className={styles.inputRow}>
            <input
              type="color"
              className={styles.swatchInput}
              aria-label="Pick a colour"
              // The native picker only understands opaque 6-digit hex, so
              // alpha is dropped for this control specifically — every other
              // control in the tool keeps it.
              value={rgbToHex({ ...rgb, a: 1 })}
              onChange={(e) => setRgb({ ...(parseColor(e.target.value)?.rgb ?? rgb), a: rgb.a })}
            />
            <TextInput
              mono
              aria-label="Colour value — hex, rgb(), hsl(), oklch(), or a CSS name"
              value={state.color}
              onChange={(e) => patch({ color: e.target.value })}
              placeholder="#3366ff, rgb(51 102 255), hsl(220 100% 60%), oklch(0.55 0.2 260), rebeccapurple…"
              invalid={!parsed && state.color.trim() !== ''}
            />
          </div>
          {!parsed && state.color.trim() !== '' && (
            <Callout tone="err" title="Could not parse this colour" live>
              Recognised syntaxes: hex (#rgb, #rrggbb, #rrggbbaa), rgb()/rgba(), hsl()/hsla(),
              oklch(), and the 148 CSS named colours.
            </Callout>
          )}
        </Panel>

        <Panel label="Preview">
          <div className={styles.preview}>
            <div
              className={styles.previewHalf}
              style={{ background: formatRgb(rgb), color: '#000' }}
            >
              Aa
            </div>
            <div
              className={styles.previewHalf}
              style={{ background: formatRgb(rgb), color: '#fff' }}
            >
              Aa
            </div>
          </div>
        </Panel>

        <Panel label="Formats" bodyClassName={styles.section}>
          <div className={styles.formatGrid}>
            <FormatRow label="HEX" value={rgbToHex(rgb)} />
            <FormatRow label="HEX + alpha" value={rgbToHex(rgb, true)} />
            <FormatRow label="RGB" value={formatRgb(rgb)} />
            <FormatRow label="HSL" value={formatHsl(hsl)} />
            <FormatRow label="OKLCH" value={formatOklch(oklch)} />
            <FormatRow
              label="Nearest name"
              value={named.name}
              tag={named.exact ? 'exact' : 'approximate'}
            />
          </div>
          {outOfGamut && (
            <Callout tone="warn" title="This OKLCH value is outside sRGB">
              The colour shown is clipped to the nearest displayable sRGB value — a monitor cannot
              show the exact OKLCH number as written. Reduce chroma to bring it back in gamut.
            </Callout>
          )}
        </Panel>

        <Panel label="Channels" bodyClassName={styles.section}>
          <OptionsBar>
            <OptionGroup label="Model">
              <SegmentedControl
                label="Channel model"
                value={state.model}
                onChange={(model) => patch({ model })}
                options={[
                  { value: 'rgb', label: 'RGB' },
                  { value: 'hsl', label: 'HSL' },
                  { value: 'oklch', label: 'OKLCH' },
                ]}
              />
            </OptionGroup>
            <OptionSpacer />
          </OptionsBar>

          {state.model === 'rgb' && (
            <>
              <Slider
                label="R"
                value={rgb.r}
                min={0}
                max={255}
                step={1}
                onChange={(r) => setRgb({ ...rgb, r })}
              />
              <Slider
                label="G"
                value={rgb.g}
                min={0}
                max={255}
                step={1}
                onChange={(g) => setRgb({ ...rgb, g })}
              />
              <Slider
                label="B"
                value={rgb.b}
                min={0}
                max={255}
                step={1}
                onChange={(b) => setRgb({ ...rgb, b })}
              />
              <Slider
                label="A"
                value={rgb.a}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(a) => setRgb({ ...rgb, a })}
              />
            </>
          )}
          {state.model === 'hsl' && (
            <>
              <Slider
                label="H"
                value={hsl.h}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(h) => setHsl({ ...hsl, h })}
              />
              <Slider
                label="S"
                value={hsl.s}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(s) => setHsl({ ...hsl, s })}
              />
              <Slider
                label="L"
                value={hsl.l}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(l) => setHsl({ ...hsl, l })}
              />
              <Slider
                label="A"
                value={hsl.a}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(a) => setHsl({ ...hsl, a })}
              />
            </>
          )}
          {state.model === 'oklch' && (
            <>
              <Slider
                label="L"
                value={oklch.l}
                min={0}
                max={1}
                step={0.005}
                display={(v) => v.toFixed(3)}
                onChange={(l) => setOklch({ ...oklch, l })}
              />
              <Slider
                label="C"
                value={oklch.c}
                min={0}
                max={0.4}
                step={0.002}
                display={(v) => v.toFixed(3)}
                onChange={(c) => setOklch({ ...oklch, c })}
              />
              <Slider
                label="H"
                value={oklch.h}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(h) => setOklch({ ...oklch, h })}
              />
              <Slider
                label="A"
                value={oklch.a}
                min={0}
                max={1}
                step={0.01}
                display={(v) => v.toFixed(2)}
                onChange={(a) => setOklch({ ...oklch, a })}
              />
            </>
          )}
        </Panel>

        <Panel label="WCAG contrast" bodyClassName={styles.section}>
          <div className={styles.inputRow}>
            <input
              type="color"
              className={styles.swatchInput}
              aria-label="Pick a comparison colour"
              value={rgbToHex({ ...compareRgb, a: 1 })}
              onChange={(e) => patch({ compareColor: e.target.value })}
            />
            <TextInput
              mono
              aria-label="Comparison colour, for contrast against the colour above"
              value={state.compareColor}
              onChange={(e) => patch({ compareColor: e.target.value })}
              invalid={!comparedParsed && state.compareColor.trim() !== ''}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
            <span className={styles.ratioValue}>{verdict.ratio.toFixed(2)}:1</span>
            <span style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-xs)' }}>
              "Large" text means 18.66px bold or 24px regular — everything else is "normal".
            </span>
          </div>

          <div className={styles.badgeRow}>
            <ContrastBadge label="AA normal" pass={verdict.aaNormal} />
            <ContrastBadge label="AA large" pass={verdict.aaLarge} />
            <ContrastBadge label="AAA normal" pass={verdict.aaaNormal} />
            <ContrastBadge label="AAA large" pass={verdict.aaaLarge} />
            <ContrastBadge label="UI components" pass={verdict.uiComponent} />
          </div>

          <div
            className={styles.preview}
            style={{ height: '3.5rem', background: formatRgb(rgb), color: formatRgb(compareRgb) }}
          >
            <div
              className={styles.previewHalf}
              style={{ color: formatRgb(compareRgb), background: 'transparent' }}
            >
              The quick brown fox
            </div>
          </div>
        </Panel>

        <Panel label="Tint / shade ramp" bodyClassName={styles.section}>
          <div className={styles.rampGroup}>
            <span className={styles.rampGroupLabel}>OKLCH — perceptually even lightness steps</span>
            <RampRow stops={ramp} />
          </div>
          <div className={styles.rampGroup}>
            <span className={styles.rampGroupLabel}>Naive HSL lightness — for comparison</span>
            <RampRow stops={naiveRamp} />
            <Callout tone="info">
              Same idea, walked in HSL lightness instead of OKLCH: notice the middle stops clump and
              jump in perceived brightness rather than stepping evenly, because HSL lightness is not
              perceptually uniform — this is the actual case for building the ramp above in OKLCH
              rather than the more familiar space.
            </Callout>
          </div>
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}

function FormatRow({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <>
      <span className={styles.formatLabel}>{label}</span>
      <span className={styles.formatValue}>{value}</span>
      {tag && <span className={styles.approxTag}>{tag}</span>}
      {!tag && <span />}
      <CopyButton value={value} size="sm" variant="ghost" iconOnly label={`Copy ${label}`} />
    </>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  display?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        className={styles.sliderInput}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.sliderValue}>
        {display ? display(value) : Math.round(value)}
        {unit}
      </span>
    </div>
  )
}

function ContrastBadge({ label, pass }: { label: string; pass: boolean }) {
  return (
    <span className={`${styles.badge} ${pass ? styles.badgePass : styles.badgeFail}`}>
      {pass ? '✓' : '✗'} {label}
    </span>
  )
}

/**
 * Each stop is a plain `<button>` rather than the shared `CopyButton` — that
 * component renders its own label text plus a copy glyph, which leaves no
 * room for the stop to also *be* the swatch. A toast stands in for the
 * button's own "Copied" state instead, which is exactly what toasts are for
 * per `Toast.tsx`: confirming something that happened away from a visible
 * control the user can watch change.
 */
function RampRow({ stops }: { stops: Array<{ stop: number; hex: string }> }) {
  const toast = useToast()
  return (
    <div className={styles.ramp}>
      {stops.map((s) => {
        const stopRgb = parseColor(s.hex)?.rgb ?? BLACK
        const textColor = relativeLuminance(stopRgb) > 0.4 ? '#111' : '#fff'
        return (
          <button
            key={s.stop}
            type="button"
            className={styles.rampStop}
            style={{ background: s.hex, color: textColor }}
            title={`Copy ${s.hex}`}
            onClick={() => {
              void copyText(s.hex).then((ok) =>
                toast.show(ok ? `Copied ${s.hex}` : 'Copy failed', ok ? 'ok' : 'err'),
              )
            }}
          >
            {s.stop}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The naive counterpart to `buildRamp`: walks HSL lightness instead of OKLCH
 * lightness, using the same range and step count. Deliberately not exported
 * from color.ts — this exists only to be looked at next to the real ramp, not
 * to be reused, so it stays here as a demo rather than becoming library code
 * nobody asked for.
 */
function naiveHslRamp(rgb: Rgb, steps = 9): Array<{ stop: number; hex: string }> {
  const base = rgbToHsl(rgb)
  const out: Array<{ stop: number; hex: string }> = []
  for (let i = 0; i < steps; i++) {
    const l = 96 - (i / (steps - 1)) * 86
    out.push({ stop: (i + 1) * 100, hex: rgbToHex(hslToRgb({ h: base.h, s: base.s, l, a: 1 })) })
  }
  return out
}
