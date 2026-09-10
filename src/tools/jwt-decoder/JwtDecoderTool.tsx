import { useEffect, useId, useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { StatGrid, type Stat } from '@/components/StatGrid'
import { Field, SegmentedControl, TextInput } from '@/components/Field'
import { IconShield, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import {
  SAMPLE_JWT,
  SAMPLE_JWT_SECRET,
  decodeJwt,
  expiryState,
  isHmacAlgorithm,
  readClaimTime,
  verifyHmacSignature,
  type ClaimTimeState,
  type HmacAlgorithm,
} from './jwt'

interface State {
  token: string
  hmacAlg: HmacAlgorithm
}

const DEFAULTS: State = {
  token: '',
  hmacAlg: 'HS256',
}

const isState = shapeValidator<State>({
  token: 'string',
  hmacAlg: 'string',
})

const CLAIM_TONE: Record<ClaimTimeState, 'ok' | 'warn' | 'err' | undefined> = {
  expired: 'err',
  'not-yet-valid': 'warn',
  valid: 'ok',
  'n/a': undefined,
}

const REGISTERED_CLAIMS = ['iss', 'sub', 'aud', 'jti'] as const
const TIME_CLAIMS = ['iat', 'nbf', 'exp'] as const

export default function JwtDecoderTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  // `Field` renders its own `<label htmlFor>`, but leaves wiring an id onto
  // the actual control to the caller (it has no render-prop to inject one) —
  // generating it here and passing it both ways is what actually makes the
  // label reach the input, rather than merely sitting next to it.
  const secretFieldId = useId()

  // The secret NEVER goes through useShareState: that object is what the
  // Share button base64-encodes into a URL fragment, and a URL is logged by
  // proxies, browser history, and referrer headers. Holding it in plain
  // useState keeps it local to this tab's memory for this session only.
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [verifyResult, setVerifyResult] = useState<
    { match?: boolean; error?: string } | undefined
  >()
  const [verifying, setVerifying] = useState(false)

  const decoded = useMemo(() => decodeJwt(state.token), [state.token])
  const alg = typeof decoded.header?.alg === 'string' ? decoded.header.alg : undefined
  const canVerify = decoded.ok && isHmacAlgorithm(alg)

  // Verification is async (Web Crypto), so it cannot live in the useMemo
  // above. It re-runs whenever the inputs that affect the signature change,
  // and a stale flag stops an old token's result from painting after the
  // user has already moved on to a new one.
  useEffect(() => {
    // Clearing a stale verdict, then flagging that work has started: both are
    // describing this effect's own asynchronous work to the UI, not deriving
    // state from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerifyResult(undefined)
    if (!canVerify || !secret || !decoded.signingInput || !decoded.signatureB64Url) return
    let stale = false
    setVerifying(true)
    void verifyHmacSignature(decoded.signingInput, decoded.signatureB64Url, secret, state.hmacAlg)
      .then((result) => {
        if (stale) return
        setVerifyResult(result.ok ? { match: result.match } : { error: result.error })
      })
      .finally(() => {
        if (!stale) setVerifying(false)
      })
    return () => {
      stale = true
    }
  }, [canVerify, secret, decoded.signingInput, decoded.signatureB64Url, state.hmacAlg])

  const claimStats: Stat[] = useMemo(() => {
    if (!decoded.ok || !decoded.payload) return []
    const payload = decoded.payload
    const timeState = expiryState(payload) // only depends on exp/nbf, computed once for both

    const stats: Stat[] = []
    for (const key of REGISTERED_CLAIMS) {
      const value = payload[key]
      if (value === undefined) continue
      stats.push({ label: key, value: formatClaimValue(value) })
    }
    for (const key of TIME_CLAIMS) {
      const time = readClaimTime(payload[key])
      if (!time) continue
      // iat is informational only — exp/nbf are what gate validity, so only
      // they get a pass/fail colour on the "expired N ago" style note.
      // StatGrid itself only has one accent colour, not a tone palette, so
      // the state colour is applied directly here rather than widening a
      // shared component's API for two rows in one tool.
      const gates = key === 'exp' || key === 'nbf'
      const tone = gates ? CLAIM_TONE[timeState] : undefined
      stats.push({
        label: key,
        value: time.absolute,
        note: tone ? (
          <span style={{ color: `var(--${tone})` }}>{time.relative}</span>
        ) : (
          time.relative
        ),
      })
    }
    return stats
  }, [decoded])

  const loadSample = () => {
    patch({ token: SAMPLE_JWT, hmacAlg: 'HS256' })
    setSecret(SAMPLE_JWT_SECRET)
  }

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={loadSample}>
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              patch({ token: '' })
              setSecret('')
            }}
            disabled={!state.token}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <Callout tone="warn" title="Decoding is not verification">
        Anyone can construct a JWT with any header and payload — only a valid signature proves it
        came from whoever holds the key. A token is often itself a credential (a bearer token):
        treat a token you did not issue as sensitive, and never paste a live session token here and
        then Share the link.
      </Callout>

      <PaneStack>
        <Panel
          label="Token"
          status={
            state.token ? pluralize(state.token.trim().split('.').length, 'segment') : undefined
          }
        >
          <CodeArea
            label="Compact JWT (header.payload.signature)"
            value={state.token}
            onValueChange={(token) => patch({ token })}
            softWrap
            placeholder="Paste a compact JWT, e.g. eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature"
          />
        </Panel>

        {!state.token ? (
          <Panel>
            <EmptyState compact title="Nothing to decode yet" mark={<IconShield size={24} />}>
              Paste a token above, or load the Sample to see header, payload, claims, and HMAC
              verification all at once.
            </EmptyState>
          </Panel>
        ) : !decoded.ok ? (
          <Panel tone="err">
            <div style={{ padding: 'var(--sp-3)' }}>
              <Callout tone="err" title="Cannot decode this token" live>
                {decoded.error}
              </Callout>
            </div>
          </Panel>
        ) : (
          <>
            {decoded.algNone && (
              <Callout
                tone="err"
                title={`alg: "${decoded.header?.alg}" — no signature is possible`}
              >
                This token declares the JWS "none" algorithm, which has no signature at all. A
                server that honours <code>alg: none</code> on an incoming token is trivially
                bypassable — this is a real, historical vulnerability class, not a theoretical one.
                Never treat a "none" token as authenticated.
              </Callout>
            )}

            <TwoPane
              storageKey="jwt-decoder"
              labelFirst="header"
              labelSecond="payload"
              input={
                <Panel
                  label="Header"
                  actions={<CopyButton value={JSON.stringify(decoded.header, null, 2)} />}
                >
                  <CodeArea
                    label="Decoded header"
                    value={JSON.stringify(decoded.header, null, 2)}
                    readOnly
                    lineNumbers
                    softWrap
                  />
                </Panel>
              }
              output={
                <Panel
                  label="Payload"
                  actions={<CopyButton value={JSON.stringify(decoded.payload, null, 2)} />}
                >
                  <CodeArea
                    label="Decoded payload"
                    value={JSON.stringify(decoded.payload, null, 2)}
                    readOnly
                    lineNumbers
                    softWrap
                  />
                </Panel>
              }
            />

            {claimStats.length > 0 && (
              <Panel label="Registered claims">
                <div style={{ padding: 'var(--sp-3)' }}>
                  <StatGrid stats={claimStats} />
                </div>
              </Panel>
            )}

            <Panel label="Local HMAC verification">
              <div
                style={{
                  padding: 'var(--sp-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-3)',
                }}
              >
                {!isHmacAlgorithm(alg) ? (
                  <Callout tone="info" title={`${alg ?? 'This algorithm'} is not verifiable here`}>
                    Only HS256, HS384, and HS512 are offered — those verify against a shared secret,
                    which is the only kind of key this tool ever asks for. RS*, ES*, and PS*
                    algorithms verify against a public key instead (a JWK or PEM, with
                    algorithm-specific padding or curve handling), which is a different code path
                    this tool does not implement rather than fake.
                  </Callout>
                ) : (
                  <>
                    <OptionsBar>
                      <OptionGroup label="Algorithm">
                        <SegmentedControl
                          label="HMAC algorithm"
                          value={state.hmacAlg}
                          onChange={(hmacAlg) => patch({ hmacAlg })}
                          options={[
                            { value: 'HS256', label: 'HS256' },
                            { value: 'HS384', label: 'HS384' },
                            { value: 'HS512', label: 'HS512' },
                          ]}
                        />
                      </OptionGroup>
                      <OptionSpacer />
                    </OptionsBar>

                    <Field
                      label="Secret"
                      htmlFor={secretFieldId}
                      hint="Held only in this tab's memory — never included in a Share link."
                    >
                      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                        <TextInput
                          id={secretFieldId}
                          aria-describedby={`${secretFieldId}-hint`}
                          type={showSecret ? 'text' : 'password'}
                          mono
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                          placeholder="The HMAC secret this token was signed with"
                        />
                        <Button size="sm" variant="ghost" onClick={() => setShowSecret((v) => !v)}>
                          {showSecret ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </Field>

                    {secret && (
                      <div role="status" aria-live="polite">
                        {verifying ? (
                          <Callout tone="info" title="Verifying…" />
                        ) : verifyResult?.error ? (
                          <Callout tone="err" title="Could not verify">
                            {verifyResult.error}
                          </Callout>
                        ) : verifyResult?.match === true ? (
                          <Callout tone="ok" title="Signature matches">
                            This token's signature is valid for the given secret and algorithm.
                          </Callout>
                        ) : verifyResult?.match === false ? (
                          <Callout tone="err" title="Signature does not match">
                            Either the secret, the algorithm, or the token itself does not match
                            what actually signed this token.
                          </Callout>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Panel>
          </>
        )}
      </PaneStack>
    </ToolShell>
  )
}

function formatClaimValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}
