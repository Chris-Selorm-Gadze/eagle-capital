import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

export const posthogConfigured = Boolean(apiKey)

/** Call once at app startup. A no-op with no key configured — same "optional, degrades quietly"
 * pattern as Sentry/Supabase/broker-sync's own configured-checks.
 *
 * Capture is deliberately conservative: this app's UI shows real account balances, broker
 * labels, and trade P&L as visible text/attributes, and PostHog's default autocapture would
 * otherwise record that verbatim on every click. mask_all_text/mask_all_element_attributes keep
 * autocapture structural (what was clicked) without the literal dollar figures or account labels.
 * Pageviews are captured manually from App.tsx's own nav-change effect instead of relying on
 * autocapture's SPA history detection, since this app hand-rolls pushState/replaceState rather
 * than using a router library — more reliable to just call it ourselves at the one place nav
 * changes are already handled. No session replay, for the same reason as Sentry's setup. */
export function initPostHog(): void {
  if (!apiKey) return
  posthog.init(apiKey, {
    api_host: apiHost,
    capture_pageview: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
  })
}

export { posthog }
