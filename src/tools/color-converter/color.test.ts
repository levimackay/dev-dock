import { describe, expect, it } from 'vitest'
import {
  buildRamp,
  contrastRatio,
  formatHsl,
  formatOklch,
  formatRgb,
  gradeContrast,
  hslToRgb,
  isOutOfSrgbGamut,
  nearestNamed,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
} from './color'

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a })

describe('parseColor', () => {
  it('rejects empty and nonsense input', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('not a colour')).toBeNull()
    expect(parseColor('#12345')).toBeNull()
  })

  it('parses six-digit hex with and without the hash', () => {
    expect(parseColor('#ff8800')?.rgb).toEqual(rgb(255, 136, 0))
    expect(parseColor('ff8800')?.rgb).toEqual(rgb(255, 136, 0))
  })

  it('expands three-digit hex', () => {
    expect(parseColor('#f80')?.rgb).toEqual(rgb(255, 136, 0))
  })

  it('parses eight-digit hex as including alpha', () => {
    expect(parseColor('#ff880080')?.rgb.a).toBeCloseTo(0.502, 2)
  })

  it('parses legacy comma rgb()', () => {
    expect(parseColor('rgb(255, 136, 0)')?.rgb).toEqual(rgb(255, 136, 0))
  })

  it('parses modern space rgb() with a slash alpha', () => {
    const parsed = parseColor('rgb(255 136 0 / 50%)')
    expect(parsed?.rgb).toEqual(rgb(255, 136, 0, 0.5))
  })

  it('parses rgba() with a decimal alpha', () => {
    expect(parseColor('rgba(0, 0, 0, 0.25)')?.rgb.a).toBe(0.25)
  })

  it('parses hsl() and converts it', () => {
    expect(parseColor('hsl(120 100% 50%)')?.rgb).toEqual(rgb(0, 255, 0))
  })

  it('parses hue units other than plain degrees', () => {
    expect(parseColor('hsl(0.5turn 100% 50%)')?.rgb).toEqual(rgb(0, 255, 255))
  })

  it('parses oklch()', () => {
    const parsed = parseColor('oklch(0.628 0.2577 29.23)')
    expect(parsed?.format).toBe('oklch')
    // That is sRGB red to within rounding.
    expect(parsed!.rgb.r).toBeGreaterThan(250)
    expect(parsed!.rgb.g).toBeLessThan(10)
  })

  it('parses a named colour', () => {
    expect(parseColor('rebeccapurple')?.rgb).toEqual(rgb(102, 51, 153))
  })

  it('parses transparent as fully transparent black', () => {
    expect(parseColor('transparent')?.rgb).toEqual(rgb(0, 0, 0, 0))
  })

  it('clamps out-of-range channels rather than failing', () => {
    expect(parseColor('rgb(300 -20 0)')?.rgb).toEqual(rgb(255, 0, 0))
  })
})

describe('hex formatting', () => {
  it('omits alpha when opaque', () => {
    expect(rgbToHex(rgb(255, 136, 0))).toBe('#ff8800')
  })

  it('appends alpha when translucent', () => {
    expect(rgbToHex(rgb(255, 136, 0, 0.5))).toBe('#ff880080')
  })

  it('pads single digits', () => {
    expect(rgbToHex(rgb(1, 2, 3))).toBe('#010203')
  })
})

describe('HSL round trip', () => {
  it('converts pure red', () => {
    const hsl = rgbToHsl(rgb(255, 0, 0))
    expect(hsl.h).toBe(0)
    expect(hsl.s).toBe(100)
    expect(hsl.l).toBe(50)
  })

  it('reports zero saturation for grey', () => {
    expect(rgbToHsl(rgb(128, 128, 128)).s).toBe(0)
  })

  it('round-trips a sample of colours within one unit per channel', () => {
    for (const sample of [rgb(255, 136, 0), rgb(12, 200, 90), rgb(3, 7, 250), rgb(200, 200, 40)]) {
      const back = hslToRgb(rgbToHsl(sample))
      expect(Math.abs(back.r - sample.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - sample.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - sample.b)).toBeLessThanOrEqual(1)
    }
  })
})

describe('OKLCH', () => {
  it('gives white a lightness of 1 and no chroma', () => {
    const white = rgbToOklch(rgb(255, 255, 255))
    expect(white.l).toBeCloseTo(1, 3)
    expect(white.c).toBeCloseTo(0, 3)
  })

  it('gives black a lightness of 0', () => {
    expect(rgbToOklch(rgb(0, 0, 0)).l).toBeCloseTo(0, 4)
  })

  it('matches the published values for sRGB red', () => {
    const red = rgbToOklch(rgb(255, 0, 0))
    expect(red.l).toBeCloseTo(0.6279, 3)
    expect(red.c).toBeCloseTo(0.2577, 3)
    expect(red.h).toBeCloseTo(29.23, 1)
  })

  it('reports hue 0 for neutrals instead of atan2 noise', () => {
    expect(rgbToOklch(rgb(100, 100, 100)).h).toBe(0)
  })

  it('round-trips exactly for in-gamut colours', () => {
    for (const sample of [rgb(255, 136, 0), rgb(20, 30, 40), rgb(0, 128, 255)]) {
      expect(oklchToRgb(rgbToOklch(sample))).toEqual(sample)
    }
  })

  it('is perceptually even: equal lightness steps stay equal', () => {
    // The point of OKLCH. Two colours at the same L should have similar WCAG
    // luminance regardless of hue — HSL fails this badly.
    const yellow = oklchToRgb({ l: 0.7, c: 0.12, h: 100, a: 1 })
    const blue = oklchToRgb({ l: 0.7, c: 0.12, h: 260, a: 1 })
    const ratio = relativeLuminance(yellow) / relativeLuminance(blue)
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(1.7)
  })

  it('detects an out-of-gamut colour', () => {
    expect(isOutOfSrgbGamut({ l: 0.7, c: 0.37, h: 140, a: 1 })).toBe(true)
    expect(isOutOfSrgbGamut({ l: 0.7, c: 0.05, h: 140, a: 1 })).toBe(false)
  })
})

describe('contrast', () => {
  it('gives black on white the canonical 21:1', () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 5)
  })

  it('gives an identical pair 1:1', () => {
    expect(contrastRatio(rgb(90, 90, 90), rgb(90, 90, 90))).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    const a = rgb(30, 90, 200)
    const b = rgb(240, 240, 200)
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })

  it('grades a passing pair against every WCAG threshold', () => {
    const verdict = gradeContrast(rgb(0, 0, 0), rgb(255, 255, 255))
    expect(verdict).toMatchObject({
      aaNormal: true,
      aaLarge: true,
      aaaNormal: true,
      aaaLarge: true,
      uiComponent: true,
    })
  })

  it('fails normal AA but passes large AA in the 3-4.5 band', () => {
    // #767676 on white is 4.54; #949494 is about 3.0.
    const verdict = gradeContrast(rgb(0x94, 0x94, 0x94), rgb(255, 255, 255))
    expect(verdict.ratio).toBeGreaterThan(2.9)
    expect(verdict.ratio).toBeLessThan(4.5)
    expect(verdict.aaNormal).toBe(false)
    expect(verdict.aaLarge).toBe(true)
  })
})

describe('nearestNamed', () => {
  it('finds an exact match', () => {
    const result = nearestNamed(rgb(255, 0, 0))
    expect(result.name).toBe('red')
    expect(result.exact).toBe(true)
  })

  it('finds a close match and reports it as inexact', () => {
    const result = nearestNamed(rgb(253, 2, 4))
    expect(result.name).toBe('red')
    expect(result.exact).toBe(false)
    expect(result.distance).toBeGreaterThan(0)
  })
})

describe('formatting', () => {
  it('writes modern rgb syntax', () => {
    expect(formatRgb(rgb(1, 2, 3))).toBe('rgb(1 2 3)')
    expect(formatRgb(rgb(1, 2, 3, 0.5))).toBe('rgb(1 2 3 / 50%)')
  })

  it('writes hsl with percentage units', () => {
    expect(formatHsl(rgbToHsl(rgb(255, 0, 0)))).toBe('hsl(0 100% 50%)')
  })

  it('writes oklch with enough precision to round-trip', () => {
    const text = formatOklch(rgbToOklch(rgb(255, 136, 0)))
    expect(parseColor(text)!.rgb).toEqual(rgb(255, 136, 0))
  })
})

describe('buildRamp', () => {
  it('produces the requested number of stops', () => {
    expect(buildRamp(rgb(255, 136, 0), 9)).toHaveLength(9)
  })

  it('runs light to dark', () => {
    const ramp = buildRamp(rgb(255, 136, 0), 9)
    const first = relativeLuminance(parseColor(ramp[0]!.hex)!.rgb)
    const last = relativeLuminance(parseColor(ramp[8]!.hex)!.rgb)
    expect(first).toBeGreaterThan(last)
  })

  it('labels stops the way design systems number them', () => {
    expect(buildRamp(rgb(0, 0, 255), 9).map((s) => s.stop)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900,
    ])
  })
})
