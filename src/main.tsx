import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthGate } from './AuthGate'
import { AuthProvider } from './features/auth/AuthContext'
import { ErrorBoundary } from './shared/ui/ErrorBoundary'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import './theme.css'

posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  defaults: '2026-05-30',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PostHogProvider client={posthog}>
      <ErrorBoundary>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ErrorBoundary>
    </PostHogProvider>
  </React.StrictMode>,
)
