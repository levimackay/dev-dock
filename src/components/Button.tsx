import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import styles from './Button.module.css'
import { cx } from '@/lib/cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Renders square. Requires `aria-label` — there is no visible text to read. */
  iconOnly?: boolean
  fullWidth?: boolean
  /** Toggle state. Sets `aria-pressed` as well as the visual treatment. */
  pressed?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    fullWidth = false,
    pressed,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        iconOnly && styles.iconOnly,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        className,
      )}
      {...rest}
    />
  )
})
