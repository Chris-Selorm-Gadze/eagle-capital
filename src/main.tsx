import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthGate } from './AuthGate'
import { AuthProvider } from './features/auth/AuthContext'
import { ErrorBoundary } from './shared/ui/ErrorBoundary'
import { initSentry } from './lib/sentry'
import { initPostHog } from './lib/posthog'
import './index.css'
import './theme.css'

initSentry()
initPostHog()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
