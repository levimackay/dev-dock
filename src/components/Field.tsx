import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import styles from './Field.module.css'
import { IconCheck } from './Icon'
import { cx } from '@/lib/cx'

/* ------------------------------------------------------------------ Field */

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Label to the left instead of above. For dense option panels. */
  inline?: boolean
  htmlFor?: string
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint/error, wired together.
 *
 * The point of centralising this is `aria-describedby`: it is easy to write a
 * hint that looks associated with its input and is invisible to a screen
 * reader. Doing it once here means it is right in all 22 tools.
 */
export function Field({ label, hint, error, inline, htmlFor, className, children }: FieldProps) {
  const autoId = useId()
  const id = htmlFor ?? autoId
  return (
    <div className={cx(styles.field, inline && styles.inline, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>{children}</div>
      {hint && !error && (
        <span className={styles.hint} id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className={styles.error} id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- TextInput */

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
  invalid?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { mono, invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(styles.input, mono && styles.mono, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoComplete="off"
      {...rest}
    />
  )
})

/* ----------------------------------------------------------------- Select */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  mono?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { mono, className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(styles.input, styles.select, mono && styles.mono, className)}
      {...rest}
    >
      {children}
    </select>
  )
})

/* ------------------------------------------------------- SegmentedControl */

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  /** Accessible name for the group. */
  label: string
  fullWidth?: boolean
  className?: string
}

/**
 * A radio group that looks like a toolbar.
 *
 * It is built from real `role="radio"` buttons with roving `tabindex`, not from
 * styled checkboxes, so arrow keys move between options and only the group
 * takes one stop in the tab order — the behaviour a keyboard user expects from
 * something that looks like this.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  fullWidth,
  className,
}: SegmentedControlProps<T>) {
  const index = options.findIndex((o) => o.value === value)

  const move = (delta: number) => {
    if (options.length === 0) return
    const next = options[(index + delta + options.length) % options.length]
    if (next) onChange(next.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(styles.segmented, fullWidth && styles.segmentFull, className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        }
      }}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            className={cx(styles.segment, selected && styles.segmentActive)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- Checkbox */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  return (
    <label className={cx(styles.check, className)}>
      <input ref={ref} type="checkbox" className={styles.checkNative} {...rest} />
      <span className={styles.checkBox} aria-hidden="true">
        <IconCheck size={11} strokeWidth={2.25} />
      </span>
      {label}
    </label>
  )
})

/** Horizontal group for dense option rows. */
export function OptionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.row, className)}>{children}</div>
}
