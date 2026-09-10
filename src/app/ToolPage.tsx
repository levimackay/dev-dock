import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTool } from '@/tools/registry'
import { ShareContext, type ShareBridge } from '@/tools/useShareState'
import { ToolChromeProvider } from '@/components/ToolShell'
import { ToolErrorBoundary } from './ToolErrorBoundary'
import { NotFoundPage } from './NotFoundPage'
import { usePreferences } from './preferences'
import { Button } from '@/components/Button'
import { IconLink, IconStar } from '@/components/Icon'
import { useToast } from '@/components/Toast'
import { useHotkey } from '@/lib/useHotkey'
import {
  MAX_SHARE_CHARS,
  buildShareUrl,
  clearShareFragment,
  decodeShareState,
  encodeShareState,
  readShareFragment,
} from '@/lib/share'
import { copyText } from '@/lib/clipboard'
import styles from './ToolPage.module.css'

const anyObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Route entry point.
 *
 * The real work is in `ToolRoute`, which is keyed by tool id so that every
 * piece of per-tool state — most importantly the share-link hydration — is
 * recreated from scratch on navigation rather than carried across.
 *
 * That key is load-bearing. Without it, arriving at tool B via a share link
 * while tool A is open would find `ready` already true from A's mount, mount B
 * with its defaults, and only patch in the payload a tick later — clobbering
 * anything typed in between. Remounting makes the race unrepresentable instead
 * of merely unlikely.
 */
export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  return <ToolRoute key={toolId ?? '__none__'} toolId={toolId} />
}

function ToolRoute({ toolId }: { toolId: string | undefined }) {
  const tool = getTool(toolId)
  const { isPinned, togglePin, noteVisit } = usePreferences()
  const toast = useToast()

  const getState = useRef<(() => unknown) | null>(null)
  const [inbound, setInbound] = useState<unknown>(undefined)
  // A tool must not mount until we know whether it is being hydrated from a
  // link, otherwise it renders defaults and has to be patched a tick later.
  const [ready, setReady] = useState(() => readShareFragment() === null)

  useEffect(() => {
    const payload = readShareFragment()
    // No payload means the `ready` initialiser already resolved this
    // synchronously; setting state again here would only cost a render.
    if (!payload) return
    let cancelled = false
    void decodeShareState(payload, anyObject).then((decoded) => {
      if (cancelled) return
      setInbound(decoded ?? undefined)
      setReady(true)
      // The payload is now in component state; leaving it in the address bar
      // means every later copy of the URL carries stale input.
      clearShareFragment()
      if (!decoded) toast.show('That share link could not be read. Starting empty.', 'err')
    })
    return () => {
      cancelled = true
    }
    // Runs once per mount, and the component is remounted per tool.
  }, [toast])

  useEffect(() => {
    if (tool) noteVisit(tool.id)
  }, [tool, noteVisit])

  useEffect(() => {
    document.title = tool ? `${tool.name} · Dev Dock` : 'Dev Dock'
  }, [tool])

  const bridge = useMemo<ShareBridge>(
    () => ({
      inbound,
      register: (getter) => {
        getState.current = getter
      },
    }),
    [inbound],
  )

  const share = useCallback(async () => {
    const state = getState.current?.()
    if (!state || !tool) {
      toast.show('This tool has nothing to share yet.', 'info')
      return
    }
    const encoded = await encodeShareState(state)
    const url = buildShareUrl(`/t/${tool.id}`, encoded)
    if (url.length > MAX_SHARE_CHARS) {
      toast.show(
        `That input is too large to fit in a link (${url.length.toLocaleString()} characters). Copy the text instead.`,
        'err',
      )
      return
    }
    const copied = await copyText(url)
    toast.show(
      copied
        ? 'Share link copied. It carries your input, so treat it as sensitive.'
        : 'Could not write to the clipboard.',
      copied ? 'ok' : 'err',
    )
  }, [tool, toast])

  useHotkey(
    'mod+shift+s',
    (e) => {
      e.preventDefault()
      void share()
    },
    { allowInInput: true, enabled: Boolean(tool) },
  )

  useHotkey(
    'mod+d',
    (e) => {
      e.preventDefault()
      if (tool) togglePin(tool.id)
    },
    { allowInInput: true, enabled: Boolean(tool) },
  )

  if (!tool) return <NotFoundPage missing={toolId} />

  const pinnedNow = isPinned(tool.id)
  const { Component } = tool

  const chrome = {
    meta: tool,
    share: (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void share()}
        title="Copy a link that restores this input (⌘⇧S)"
      >
        <IconLink size={13} />
        Share
      </Button>
    ),
    pin: (
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        pressed={pinnedNow}
        onClick={() => togglePin(tool.id)}
        aria-label={pinnedNow ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
        title={pinnedNow ? 'Unpin from the rail (⌘D)' : 'Pin to the rail (⌘D)'}
      >
        <IconStar size={14} filled={pinnedNow} />
      </Button>
    ),
  }

  return (
    <ShareContext.Provider value={bridge}>
      <ToolChromeProvider value={chrome}>
        <ToolErrorBoundary toolId={tool.id} toolName={tool.name}>
          <Suspense fallback={<ToolSkeleton />}>
            {ready ? <Component /> : <ToolSkeleton />}
          </Suspense>
        </ToolErrorBoundary>
      </ToolChromeProvider>
    </ShareContext.Provider>
  )
}

/**
 * Shown while a tool's chunk downloads. It mirrors the real layout rather than
 * showing a spinner, so the frame does not jump when the tool arrives.
 */
function ToolSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading tool">
      <div className={styles.skelBar} />
      <div className={styles.skelBody}>
        <div className={styles.skelPane} />
        <div className={styles.skelPane} />
      </div>
    </div>
  )
}
