import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

export const sentryConfigured = Boolean(dsn)

/** Call once at app startup, before rendering. A no-op with no DSN configured — matches
 * supabaseConfigured/brokerSyncConfigured's "optional, degrades quietly" pattern rather than
 * throwing in dev environments that haven't set this up.
 *
 * No session replay: this app shows real broker balances, account labels, and trade data —
 * recording UI sessions by default risks capturing that in Sentry's storage. Errors/traces only. */
export function initSentry(): void {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  })
}
