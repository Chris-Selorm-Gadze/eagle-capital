import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthGate } from './AuthGate'
import { AuthProvider } from './features/auth/AuthContext'
import { ErrorBoundary } from './shared/ui/ErrorBoundary'
import { initSentry } from './lib/sentry'
import { initPostHog } from './lib/posthog'
import { initTheme } from './lib/theme'
import './index.css'
import './theme.css'

initSentry()
initPostHog()
// index.html already set the class pre-paint; this re-asserts it from the same
// source the switcher reads, and starts following the OS setting when the user
// hasn't made an explicit choice.
initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
