/* eslint-disable jsx-a11y/interactive-supports-focus -- The APG radio-group
   pattern puts the tab stop on the checked radio (the roving tabindex in
   SegmentedControl) and leaves the container unfocusable. The rule asks for a
   second, redundant tab stop on the container. */
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
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
 * The point of centralising this is the wiring, not the layout. A `<label
 * htmlFor>` that points at an id no element carries is invisible to a screen
 * reader while looking perfectly correct on screen, and the same goes for a
 * hint that is never referenced by `aria-describedby`. Both are easy to get
 * wrong once per tool and impossible to notice by looking.
 *
 * So Field owns the id. It generates one, points the label at it, and clones
 * its single child to inject `id` and `aria-describedby`, plus `aria-invalid`
 * when an error is showing. A caller that supplies its own `id` keeps it.
 *
 * The clone only happens for a lone element child. Anything else (a fragment, a
 * group of checkboxes) is rendered untouched and is expected to carry its own
 * labelling, because there is no single control to point at.
 */
export function Field({ label, hint, error, inline, htmlFor, className, children }: FieldProps) {
  const autoId = useId()
  const id = htmlFor ?? autoId

  const hintId = hint && !error ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const only = Children.count(children) === 1 ? Children.only(children) : null
  const control =
    only && isValidElement(only)
      ? cloneElement(only as ReactElement<Record<string, unknown>>, {
          id: (only.props as { id?: string }).id ?? id,
          'aria-describedby':
            (only.props as { 'aria-describedby'?: string })['aria-describedby'] ?? describedBy,
          'aria-invalid': error
            ? true
            : (only.props as { 'aria-invalid'?: boolean })['aria-invalid'],
        })
      : children

  return (
    <div className={cx(styles.field, inline && styles.inline, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>{control}</div>
      {hintId && (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      )}
      {errorId && (
        <span className={styles.error} id={errorId}>
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
 * takes one stop in the tab order, the behaviour a keyboard user expects from
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
      // The APG radio-group pattern gives the tab stop to the checked radio and
      // leaves the container unfocusable, which is what the roving tabindex
      // below implements. The rule is asking for the container to be focusable,
      // which would add a second, redundant stop.
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
