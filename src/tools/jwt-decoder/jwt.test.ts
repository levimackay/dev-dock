import { describe, expect, it } from 'vitest'
import {
  SAMPLE_JWT,
  SAMPLE_JWT_SECRET,
  constantTimeEqual,
  decodeJwt,
  expiryState,
  formatRelative,
  isHmacAlgorithm,
  readClaimTime,
  verifyHmacSignature,
} from './jwt'

describe('decodeJwt', () => {
  it('decodes the sample token into header, payload, and signature', () => {
    const result = decodeJwt(SAMPLE_JWT)
    expect(result.ok).toBe(true)
    expect(result.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(result.payload).toMatchObject({
      sub: '1234567890',
      name: 'Ada Lovelace',
      iss: 'dev-dock',
    })
    expect(result.signatureB64Url).toBeTruthy()
  })

  it('rejects empty input without a crash', () => {
    const result = decodeJwt('')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Nothing to decode/)
  })

  it('reports the wrong segment count by name', () => {
    const result = decodeJwt('only.two')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/exactly 3/)
    expect(result.error).toMatch(/has 2/)
  })

  it('reports too many segments', () => {
    const result = decodeJwt('a.b.c.d')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/has 4/)
  })

  it('names a non-base64url character in a segment', () => {
    const result = decodeJwt('not base64!.eyJhIjoxfQ.sig')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/header segment/)
  })

  it('reports a header that is not valid JSON', () => {
    // "not json" base64url-encoded, still decodes as text but fails JSON.parse.
    const notJsonB64 = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeJwt(`${notJsonB64}.eyJhIjoxfQ.sig`)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/header.*not valid JSON/i)
  })

  it('reports a payload that is not valid JSON', () => {
    const header = btoa('{"alg":"none"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const notJsonB64 = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeJwt(`${header}.${notJsonB64}.sig`)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/payload.*not valid JSON/i)
  })

  it('flags alg: none as a security warning', () => {
    const header = btoa('{"alg":"none"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const payload = btoa('{"sub":"x"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeJwt(`${header}.${payload}.`)
    expect(result.ok).toBe(true)
    expect(result.algNone).toBe(true)
  })

  it('does not flag a normal algorithm as alg: none', () => {
    const result = decodeJwt(SAMPLE_JWT)
    expect(result.algNone).toBe(false)
  })
})

describe('readClaimTime', () => {
  it('reads a Unix-seconds claim as an absolute and relative time', () => {
    const claim = readClaimTime(1730000000)
    expect(claim).toBeDefined()
    expect(claim?.epochSeconds).toBe(1730000000)
    expect(typeof claim?.absolute).toBe('string')
    expect(typeof claim?.relative).toBe('string')
  })

  it('returns undefined for a non-numeric claim', () => {
    expect(readClaimTime('not a number')).toBeUndefined()
    expect(readClaimTime(undefined)).toBeUndefined()
  })
})

describe('formatRelative', () => {
  it('describes a future time as "in N units"', () => {
    const now = 1_000_000_000
    expect(formatRelative(now + 41 * 60 * 1000, now)).toBe('in 41 minutes')
  })

  it('describes a past time as "N units ago"', () => {
    const now = 1_000_000_000
    expect(formatRelative(now - 3 * 60 * 60 * 1000, now)).toBe('3 hours ago')
  })
})

describe('expiryState', () => {
  it('reports expired when now is past exp', () => {
    expect(expiryState({ exp: 1000 }, 2000 * 1000)).toBe('expired')
  })

  it('reports not-yet-valid when now is before nbf', () => {
    expect(expiryState({ nbf: 2000 }, 1000 * 1000)).toBe('not-yet-valid')
  })

  it('reports valid when now is between nbf and exp', () => {
    expect(expiryState({ nbf: 1000, exp: 3000 }, 2000 * 1000)).toBe('valid')
  })

  it('reports n/a when neither claim is present', () => {
    expect(expiryState({})).toBe('n/a')
  })
})

describe('isHmacAlgorithm', () => {
  it('accepts HS256/384/512', () => {
    expect(isHmacAlgorithm('HS256')).toBe(true)
    expect(isHmacAlgorithm('HS384')).toBe(true)
    expect(isHmacAlgorithm('HS512')).toBe(true)
  })

  it('rejects RS256 and undefined', () => {
    expect(isHmacAlgorithm('RS256')).toBe(false)
    expect(isHmacAlgorithm(undefined)).toBe(false)
  })
})

describe('verifyHmacSignature', () => {
  it('verifies the sample token against its documented secret', async () => {
    const decoded = decodeJwt(SAMPLE_JWT)
    expect(decoded.ok).toBe(true)
    const result = await verifyHmacSignature(
      decoded.signingInput ?? '',
      decoded.signatureB64Url ?? '',
      SAMPLE_JWT_SECRET,
      'HS256',
    )
    expect(result.ok).toBe(true)
    expect(result.match).toBe(true)
  })

  it('reports no match for the wrong secret', async () => {
    const decoded = decodeJwt(SAMPLE_JWT)
    const result = await verifyHmacSignature(
      decoded.signingInput ?? '',
      decoded.signatureB64Url ?? '',
      'wrong secret',
      'HS256',
    )
    expect(result.ok).toBe(true)
    expect(result.match).toBe(false)
  })

  it('rejects an empty secret with a clear message rather than silently failing', async () => {
    const result = await verifyHmacSignature('a.b', 'sig', '', 'HS256')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/secret/)
  })
})

describe('constantTimeEqual', () => {
  it('returns true for identical byte arrays', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('returns false for differing byte arrays', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })

  it('returns false for differing lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false)
  })
})

describe('segments that parse as JSON but are not objects', () => {
  // "bnVsbA" is base64url for the four characters `null`, which is valid JSON.
  it('rejects a JSON null header instead of throwing on it', () => {
    const result = decodeJwt('bnVsbA.e30.x')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not a JSON object/)
  })

  it('rejects an array header', () => {
    // "W10" is base64url for `[]`.
    const result = decodeJwt('W10.e30.x')
    expect(result.ok).toBe(false)
  })

  it('rejects a JSON null payload', () => {
    // eyJhbGciOiJIUzI1NiJ9 is {"alg":"HS256"}.
    const result = decodeJwt('eyJhbGciOiJIUzI1NiJ9.bnVsbA.x')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/payload/)
  })
})
