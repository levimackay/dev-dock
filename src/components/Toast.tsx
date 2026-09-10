import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import styles from './Toast.module.css'
import { Button } from './Button'
import { IconX } from './Icon'
import { cx } from '@/lib/cx'

type Tone = 'ok' | 'err' | 'info'

interface Toast {
  id: number
  message: string
  tone: Tone
}

interface ToastApi {
  show: (message: string, tone?: Tone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/**
 * Toasts are reserved for things that happen *away* from the user's cursor,
 * a share link written to the clipboard, a file that failed to read. Anything
 * with a visible control attached to it confirms in place instead (see
 * CopyButton), because a toast per click becomes wallpaper.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = next.current++
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.stack} role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={cx(styles.toast, styles[toast.tone])}>
              <span className={styles.message}>{toast.message}</span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Dismiss notification"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              >
                <IconX size={12} />
              </Button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  // A no-op fallback keeps tools renderable in isolation under test.
  return context ?? { show: () => undefined }
}
