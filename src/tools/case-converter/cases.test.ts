import { describe, expect, it } from 'vitest'
import { alternatingCase, convertCase, convertText, inverseCase, splitWords } from './cases'

describe('splitWords', () => {
  it('splits plain camelCase', () => {
    expect(splitWords('fooBar')).toEqual(['foo', 'Bar'])
  })

  it('splits PascalCase', () => {
    expect(splitWords('PascalCase')).toEqual(['Pascal', 'Case'])
  })

  it('keeps an acronym run together and splits it from the following word', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request'])
  })

  it('keeps a leading word separate from a trailing acronym', () => {
    expect(splitWords('parseHTMLDocument')).toEqual(['parse', 'HTML', 'Document'])
  })

  it('keeps a lone acronym as one word', () => {
    expect(splitWords('getUserID')).toEqual(['get', 'User', 'ID'])
    expect(splitWords('ID')).toEqual(['ID'])
  })

  it('splits digits out as their own token', () => {
    expect(splitWords('user2FA')).toEqual(['user', '2', 'FA'])
    expect(splitWords('base64Encode')).toEqual(['base', '64', 'Encode'])
    expect(splitWords('utf8')).toEqual(['utf', '8'])
  })

  it('splits on snake_case, kebab-case, dot.case, and path/case separators', () => {
    expect(splitWords('foo_bar_baz')).toEqual(['foo', 'bar', 'baz'])
    expect(splitWords('foo-bar-baz')).toEqual(['foo', 'bar', 'baz'])
    expect(splitWords('foo.bar.baz')).toEqual(['foo', 'bar', 'baz'])
    expect(splitWords('foo/bar/baz')).toEqual(['foo', 'bar', 'baz'])
  })

  it('splits on plain spaces', () => {
    expect(splitWords('foo bar baz')).toEqual(['foo', 'bar', 'baz'])
  })

  it('ignores leading, trailing, and repeated separators', () => {
    expect(splitWords('__foo__bar__')).toEqual(['foo', 'bar'])
    expect(splitWords('--foo--')).toEqual(['foo'])
  })

  it('returns an empty array for empty or separator-only input', () => {
    expect(splitWords('')).toEqual([])
    expect(splitWords('___')).toEqual([])
  })

  it('handles a realistic mixed identifier', () => {
    expect(splitWords('get_XMLHttpRequest2Value')).toEqual([
      'get',
      'XML',
      'Http',
      'Request',
      '2',
      'Value',
    ])
  })
})

describe('convertCase', () => {
  const words = 'XMLHttpRequest'

  it('camelCase lowercases the first word and capitalizes the rest', () => {
    expect(convertCase(words, 'camel')).toBe('xmlHttpRequest')
  })

  it('PascalCase capitalizes every word', () => {
    expect(convertCase(words, 'pascal')).toBe('XmlHttpRequest')
  })

  it('snake_case', () => {
    expect(convertCase('fooBar', 'snake')).toBe('foo_bar')
  })

  it('SCREAMING_SNAKE_CASE', () => {
    expect(convertCase('fooBar', 'screamingSnake')).toBe('FOO_BAR')
  })

  it('kebab-case', () => {
    expect(convertCase('fooBar', 'kebab')).toBe('foo-bar')
  })

  it('COBOL-CASE', () => {
    expect(convertCase('fooBar', 'cobol')).toBe('FOO-BAR')
  })

  it('Title Case', () => {
    expect(convertCase('fooBar baz', 'title')).toBe('Foo Bar Baz')
  })

  it('Sentence case', () => {
    expect(convertCase('FOO bar BAZ', 'sentence')).toBe('Foo bar baz')
  })

  it('lowercase', () => {
    expect(convertCase('Foo Bar', 'lower')).toBe('foo bar')
  })

  it('UPPERCASE', () => {
    expect(convertCase('Foo Bar', 'upper')).toBe('FOO BAR')
  })

  it('dot.case', () => {
    expect(convertCase('fooBar', 'dot')).toBe('foo.bar')
  })

  it('path/case', () => {
    expect(convertCase('fooBar', 'path')).toBe('foo/bar')
  })

  it('Train-Case', () => {
    expect(convertCase('fooBar', 'train')).toBe('Foo-Bar')
  })

  it('returns empty string for empty or separator-only input', () => {
    expect(convertCase('', 'camel')).toBe('')
    expect(convertCase('___', 'snake')).toBe('')
  })
})

describe('alternatingCase', () => {
  it('alternates starting lowercase, skipping non-letters in the phase count', () => {
    expect(alternatingCase('alternating')).toBe('aLtErNaTiNg')
  })

  it('continues the phase across a space', () => {
    expect(alternatingCase('hello world')).toBe('hElLo WoRlD')
  })

  it('passes digits and punctuation through unchanged', () => {
    expect(alternatingCase('a1b2!')).toBe('a1B2!')
  })
})

describe('inverseCase', () => {
  it('swaps the case of every letter', () => {
    expect(inverseCase('Inverse')).toBe('iNVERSE')
  })

  it('leaves non-letters untouched', () => {
    expect(inverseCase('Hello, World! 123')).toBe('hELLO, wORLD! 123')
  })
})

describe('convertText', () => {
  it('converts each line independently when perLine is true', () => {
    expect(convertText('fooBar\nbazQux', 'snake', true)).toBe('foo_bar\nbaz_qux')
  })

  it('treats the whole input as one string when perLine is false', () => {
    // Newlines are separators like any other, so multiple lines become one
    // converted identifier instead of one per line.
    expect(convertText('foo\nbar', 'camel', false)).toBe('fooBar')
  })

  it('resets the alternating-case phase at each line when perLine is true', () => {
    // 3 letters on line 1 means line 2 would start mid-phase if it carried
    // over, perLine=true instead restarts every line at lowercase.
    expect(convertText('abc\nde', 'alternating', true)).toBe('aBc\ndE')
  })

  it('keeps a continuous alternating-case phase across lines when perLine is false', () => {
    expect(convertText('abc\nde', 'alternating', false)).toBe('aBc\nDe')
  })
})
