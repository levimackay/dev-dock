/**
 * Colour parsing, conversion, and contrast scoring.
 *
 * The interesting part is OKLCH. sRGB hex is a *storage* format whose numbers
 * have almost no perceptual meaning: `#808080` is not half as bright as
 * `#ffffff`, and rotating hue in HSL changes apparent lightness dramatically
 * (compare HSL yellow at 50% lightness with HSL blue at 50%). OKLab, and its
 * cylindrical form OKLCH, is built so that equal numeric steps look like equal
 * perceptual steps, which is why the whole Dev Dock palette is authored in it.
 *
 * The conversion chain, in both directions:
 *
 *     sRGB  --linearise-->  linear RGB  --M1-->  LMS
 *           --cube root-->  L'M'S'      --M2-->  OKLab  --polar-->  OKLCH
 *
 * The two matrices come from Björn Ottosson's original definition. The cube
 * root is the perceptual compression step; it is what makes the space uniform.
 *
 * Everything here is plain numbers in, plain numbers out, so the whole file is
 * testable without a DOM.
 */

export interface Rgb {
  r: number // 0-255
  g: number
  b: number
  a: number // 0-1
}

export interface Hsl {
  h: number // 0-360
  s: number // 0-100
  l: number // 0-100
  a: number
}

export interface Oklch {
  l: number // 0-1
  c: number // 0-~0.4
  h: number // 0-360
  a: number
}

export interface ParsedColor {
  rgb: Rgb
  /** The syntax the input was written in, for the UI to echo back. */
  format: 'hex' | 'rgb' | 'hsl' | 'oklch' | 'named'
}

// ---------------------------------------------------------------- parsing

/**
 * The 148 CSS named colours, stored as packed 24-bit integers.
 *
 * A `{ name: '#rrggbb' }` object of 148 entries is about 4 KB of source; packed
 * numbers are under 1.5 KB and parse faster. The trade is that the table is not
 * readable at a glance, which for a lookup table nobody edits by hand is the
 * right way round.
 */
const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
}

export const NAMED_COLORS = Object.keys(NAMED)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Parses a percentage-or-number token: `50%` -> 0.5, `0.5` -> 0.5. */
function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1
  const text = token.trim()
  if (text === '' || text === 'none') return 1
  if (text.endsWith('%')) return clamp(Number(text.slice(0, -1)) / 100, 0, 1)
  return clamp(Number(text), 0, 1)
}

function parseChannel(token: string, scale: number): number | null {
  const text = token.trim()
  if (text === '') return null
  const value = text.endsWith('%') ? (Number(text.slice(0, -1)) / 100) * scale : Number(text)
  return Number.isFinite(value) ? value : null
}

/**
 * Parses hex, `rgb()`, `hsl()`, `oklch()`, and named colours.
 *
 * Both the legacy comma syntax (`rgb(1, 2, 3)`) and the modern space syntax
 * (`rgb(1 2 3 / 50%)`) are accepted, because both appear in real stylesheets.
 */
export function parseColor(input: string): ParsedColor | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null

  // ---- named ----
  const named = NAMED[text]
  if (named !== undefined) {
    return {
      format: 'named',
      rgb: { r: (named >> 16) & 0xff, g: (named >> 8) & 0xff, b: named & 0xff, a: 1 },
    }
  }
  if (text === 'transparent') {
    return { format: 'named', rgb: { r: 0, g: 0, b: 0, a: 0 } }
  }

  // ---- hex ----
  const hex = /^#?([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]!
    const expand = (c: string) => parseInt(c + c, 16)
    if (digits.length === 3 || digits.length === 4) {
      return {
        format: 'hex',
        rgb: {
          r: expand(digits[0]!),
          g: expand(digits[1]!),
          b: expand(digits[2]!),
          a: digits.length === 4 ? expand(digits[3]!) / 255 : 1,
        },
      }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        format: 'hex',
        rgb: {
          r: parseInt(digits.slice(0, 2), 16),
          g: parseInt(digits.slice(2, 4), 16),
          b: parseInt(digits.slice(4, 6), 16),
          a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
        },
      }
    }
    return null
  }

  // ---- functional ----
  const fn = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(text)
  if (!fn) return null

  const name = fn[1]!
  const body = fn[2]!
  const [main = '', alphaPart] = body.split('/')
  const tokens = main
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
  const alpha = alphaPart !== undefined ? parseAlpha(alphaPart) : parseAlpha(tokens[3])

  if (name.startsWith('rgb')) {
    if (tokens.length < 3) return null
    const r = parseChannel(tokens[0]!, 255)
    const g = parseChannel(tokens[1]!, 255)
    const b = parseChannel(tokens[2]!, 255)
    if (r === null || g === null || b === null) return null
    return {
      format: 'rgb',
      rgb: {
        r: clamp(Math.round(r), 0, 255),
        g: clamp(Math.round(g), 0, 255),
        b: clamp(Math.round(b), 0, 255),
        a: alpha,
      },
    }
  }

  if (name.startsWith('hsl')) {
    if (tokens.length < 3) return null
    const h = parseHue(tokens[0]!)
    const s = parseChannel(tokens[1]!, 100)
    const l = parseChannel(tokens[2]!, 100)
    if (h === null || s === null || l === null) return null
    return {
      format: 'hsl',
      rgb: hslToRgb({ h, s: clamp(s, 0, 100), l: clamp(l, 0, 100), a: alpha }),
    }
  }

  // oklch(L C H / a), L may be a percentage.
  if (tokens.length < 3) return null
  const lRaw = tokens[0]!
  const l = lRaw.endsWith('%') ? Number(lRaw.slice(0, -1)) / 100 : Number(lRaw)
  const c = Number(tokens[1])
  const h = parseHue(tokens[2]!)
  if (!Number.isFinite(l) || !Number.isFinite(c) || h === null) return null
  return { format: 'oklch', rgb: oklchToRgb({ l: clamp(l, 0, 1), c: Math.max(0, c), h, a: alpha }) }
}

function parseHue(token: string): number | null {
  const text = token.trim()
  let value: number
  if (text.endsWith('deg')) value = Number(text.slice(0, -3))
  else if (text.endsWith('turn')) value = Number(text.slice(0, -4)) * 360
  else if (text.endsWith('rad')) value = (Number(text.slice(0, -3)) * 180) / Math.PI
  else if (text.endsWith('grad')) value = (Number(text.slice(0, -4)) * 360) / 400
  else value = Number(text)
  if (!Number.isFinite(value)) return null
  return ((value % 360) + 360) % 360
}

// ------------------------------------------------------------ conversions

export function rgbToHex({ r, g, b, a }: Rgb, forceAlpha = false): string {
  const two = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  const base = `#${two(r)}${two(g)}${two(b)}`
  if (a >= 1 && !forceAlpha) return base
  return base + two(a * 255)
}

export function rgbToHsl({ r, g, b, a }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  return { h, s: s * 100, l: l * 100, a }
}

export function hslToRgb({ h, s, l, a }: Hsl): Rgb {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))

  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]

  const m = ln - c / 2
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
    a,
  }
}

/** sRGB transfer function (gamma), the piecewise curve, not a plain 2.2 power. */
function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
  return clamp(Math.round(c * 255), 0, 255)
}

export function rgbToOklch({ r, g, b, a }: Rgb): Oklch {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  // linear sRGB -> LMS (Ottosson's M1)
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  // Perceptual compression.
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  // L'M'S' -> OKLab (M2)
  const okL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const okA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(okA * okA + okB * okB)
  let h = (Math.atan2(okB, okA) * 180) / Math.PI
  if (h < 0) h += 360
  // A neutral colour has no meaningful hue; report 0 rather than atan2 noise.
  if (c < 1e-6) h = 0

  return { l: okL, c, h, a }
}

export function oklchToRgb({ l: okL, c, h, a }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180
  const okA = c * Math.cos(rad)
  const okB = c * Math.sin(rad)

  const l_ = okL + 0.3963377774 * okA + 0.2158037573 * okB
  const m_ = okL - 0.1055613458 * okA - 0.0638541728 * okB
  const s_ = okL - 0.0894841775 * okA - 1.291485548 * okB

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  }
}

/**
 * True when an OKLCH value falls outside sRGB and had to be clipped.
 *
 * Worth surfacing: OKLCH can express colours a normal monitor cannot show, and
 * a user nudging chroma upward deserves to know when the preview stopped
 * tracking the number.
 */
export function isOutOfSrgbGamut({ l, c, h }: Oklch): boolean {
  const rad = (h * Math.PI) / 180
  const okA = c * Math.cos(rad)
  const okB = c * Math.sin(rad)
  const l_ = l + 0.3963377774 * okA + 0.2158037573 * okB
  const m_ = l - 0.1055613458 * okA - 0.0638541728 * okB
  const s_ = l - 0.0894841775 * okA - 1.291485548 * okB
  const lin = [
    4.0767416621 * l_ ** 3 - 3.3077115913 * m_ ** 3 + 0.2309699292 * s_ ** 3,
    -1.2684380046 * l_ ** 3 + 2.6097574011 * m_ ** 3 - 0.3413193965 * s_ ** 3,
    -0.0041960863 * l_ ** 3 - 0.7034186147 * m_ ** 3 + 1.707614701 * s_ ** 3,
  ]
  return lin.some((channel) => channel < -0.0001 || channel > 1.0001)
}

// --------------------------------------------------------------- contrast

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface ContrastVerdict {
  ratio: number
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
  uiComponent: boolean
}

export function gradeContrast(foreground: Rgb, background: Rgb): ContrastVerdict {
  const ratio = contrastRatio(foreground, background)
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    uiComponent: ratio >= 3,
  }
}

// -------------------------------------------------------------- formatting

const round = (n: number, places = 2) => {
  const factor = 10 ** places
  return Math.round(n * factor) / factor
}

export function formatRgb(rgb: Rgb): string {
  return rgb.a >= 1
    ? `rgb(${rgb.r} ${rgb.g} ${rgb.b})`
    : `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${round(rgb.a * 100, 1)}%)`
}

export function formatHsl(hsl: Hsl): string {
  const base = `hsl(${round(hsl.h, 1)} ${round(hsl.s, 1)}% ${round(hsl.l, 1)}%`
  return hsl.a >= 1 ? `${base})` : `${base} / ${round(hsl.a * 100, 1)}%)`
}

export function formatOklch(oklch: Oklch): string {
  const base = `oklch(${round(oklch.l, 4)} ${round(oklch.c, 4)} ${round(oklch.h, 2)}`
  return oklch.a >= 1 ? `${base})` : `${base} / ${round(oklch.a * 100, 1)}%)`
}

/** Nearest CSS named colour, by squared distance in OKLab. */
export function nearestNamed(rgb: Rgb): { name: string; exact: boolean; distance: number } {
  const target = rgbToOklch(rgb)
  const ta = target.c * Math.cos((target.h * Math.PI) / 180)
  const tb = target.c * Math.sin((target.h * Math.PI) / 180)

  let bestName = 'black'
  let bestDistance = Infinity

  for (const [name, packed] of Object.entries(NAMED)) {
    const candidate = rgbToOklch({
      r: (packed >> 16) & 0xff,
      g: (packed >> 8) & 0xff,
      b: packed & 0xff,
      a: 1,
    })
    const ca = candidate.c * Math.cos((candidate.h * Math.PI) / 180)
    const cb = candidate.c * Math.sin((candidate.h * Math.PI) / 180)
    const distance = (target.l - candidate.l) ** 2 + (ta - ca) ** 2 + (tb - cb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestName = name
    }
  }

  return { name: bestName, exact: bestDistance < 1e-9, distance: Math.sqrt(bestDistance) }
}

/** A tint/shade ramp generated by walking OKLCH lightness, which stays even. */
export function buildRamp(rgb: Rgb, steps = 9): Array<{ stop: number; hex: string }> {
  const base = rgbToOklch(rgb)
  const out: Array<{ stop: number; hex: string }> = []
  for (let i = 0; i < steps; i++) {
    const l = 0.96 - (i / (steps - 1)) * 0.86
    // Chroma is reduced at the extremes, where high chroma leaves the gamut and
    // clips to a flat, muddy colour.
    const falloff = 1 - Math.abs(l - 0.55) / 0.75
    out.push({
      stop: (i + 1) * 100,
      hex: rgbToHex(oklchToRgb({ l, c: base.c * Math.max(0.25, falloff), h: base.h, a: 1 })),
    })
  }
  return out
}
