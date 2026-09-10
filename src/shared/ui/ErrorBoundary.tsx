import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Error boundaries must be class components — there's no hook equivalent of
// componentDidCatch/getDerivedStateFromError. Without this, any single uncaught error
// anywhere in the tree (e.g. a third-party widget throwing during unmount) blanks the
// entire app with no explanation and no way to recover short of a manual reload.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Uncaught error in app tree:', error, info.componentStack)
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="appSurface" style={{ padding: '3rem', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <h1 className="page-title" style={{ marginBottom: '0.75rem' }}>Something went wrong</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
