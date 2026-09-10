import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, type ButtonSize, type ButtonVariant } from './Button'
import { IconCheck, IconCopy } from './Icon'
import { copyText } from '@/lib/clipboard'

export interface CopyButtonProps {
  /** The text to copy, or a function producing it lazily on click. */
  value: string | (() => string)
  label?: string
  size?: ButtonSize
  variant?: ButtonVariant
  iconOnly?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Copy-to-clipboard with confirmation in place.
 *
 * The confirmation lives on the button rather than in a toast because that is
 * where the user is looking, and because a toast for every copy in a tool where
 * copying is the main verb becomes noise within about four clicks.
 *
 * The result is also announced in a live region: the icon swap is invisible to
 * a screen-reader user, who otherwise gets no feedback that anything happened.
 */
export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  variant = 'ghost',
  iconOnly = false,
  disabled,
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onClick = useCallback(() => {
    const text = typeof value === 'function' ? value() : value
    void copyText(text).then((ok) => {
      setState(ok ? 'copied' : 'failed')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 1400)
    })
  }, [value])

  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label

  return (
    <>
      <Button
        size={size}
        variant={variant}
        iconOnly={iconOnly}
        onClick={onClick}
        disabled={disabled}
        className={className}
        aria-label={iconOnly ? text : undefined}
        title={iconOnly ? text : undefined}
      >
        {state === 'copied' ? <IconCheck size={13} /> : <IconCopy size={13} />}
        {!iconOnly && text}
      </Button>
      <span role="status" aria-live="polite" className="visually-hidden">
        {state === 'copied' ? `${label}: copied to clipboard` : ''}
        {state === 'failed' ? `${label}: copy failed` : ''}
      </span>
    </>
  )
}
