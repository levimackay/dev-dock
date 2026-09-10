import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/Button'
import { IconRefresh, IconWarning } from '@/components/Icon'

interface Props {
  toolId: string
  toolName: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a crash inside one tool without taking the app down with it.
 *
 * Error boundaries are the one place React still requires a class component:
 * `componentDidCatch` and `getDerivedStateFromError` have no hook equivalents.
 * The boundary is keyed by tool id, so navigating to another tool remounts it
 * and clears the error automatically, the user is never stranded on a dead
 * screen because a stale error state outlived the thing that caused it.
 *
 * The message deliberately shows the real error text. This is a developer tool;
 * hiding "Unexpected token < in JSON at position 4" behind "Something went
 * wrong" helps nobody.
 */
export class ToolErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[dev-dock] ${this.props.toolId} crashed`, error, info.componentStack)
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.toolId !== this.props.toolId && this.state.error) {
      this.setState({ error: null })
    }
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <EmptyState
        title={`${this.props.toolName} hit an error`}
        mark={<IconWarning size={28} />}
        actions={
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            <IconRefresh size={14} />
            Try again
          </Button>
        }
      >
        {error.message || 'No message was attached to the error.'} The rest of Dev Dock is still
        working, so you can switch tools without reloading.
      </EmptyState>
    )
  }
}
