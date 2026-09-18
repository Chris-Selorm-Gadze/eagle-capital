/* What a user is told when a feature can't reach its backend.
 *
 * `!supabaseConfigured`, `!brokerSyncConfigured` and `!fmpConfigured` all mean
 * the same thing: an environment variable is missing from THIS build. On a
 * developer's machine that is worth naming — it turns a blank feature into a
 * one-line fix. On a deployed build it is neither actionable nor the reader's
 * fault: they cannot edit `.env.local`, and the app was putting its own
 * misconfiguration in front of them in our vocabulary ("set
 * VITE_SUPABASE_ANON_KEY"), which reads as a broken product AND states how the
 * build is wired.
 *
 * So the variable names are dev-only, and every call site has to supply a plain
 * sentence that stands on its own without them.
 *
 * The `isDev` argument is explicit rather than read inside, so the production
 * wording is testable — the same shape as `isUsableApiUrl(url, isProd)`.
 */

/**
 * @param userMessage Plain, self-contained sentence. This is all a deployed user
 *                    ever sees, so it must not name an env var, a file, or a
 *                    service.
 * @param envVars     The variables a developer needs to set.
 */
export function buildSetupNotice(userMessage: string, envVars: string[], isDev: boolean): string {
  if (!isDev || envVars.length === 0) return userMessage
  const list = envVars.length === 1
    ? (envVars[0] as string)
    : `${envVars.slice(0, -1).join(', ')} and ${envVars[envVars.length - 1]}`
  return `${userMessage} (Dev: set ${list} in .env.local.)`
}

/** The call sites' entry point — `buildSetupNotice` bound to this build. */
export function setupNotice(userMessage: string, envVars: string[]): string {
  return buildSetupNotice(userMessage, envVars, import.meta.env.DEV)
}

/* Raw thrown messages, for the same reason.
 *
 * A Postgres or fetch failure surfaces things like `duplicate key value
 * violates unique constraint "copier_relations_pkey"` or `Cannot read
 * properties of undefined`. Shown verbatim those tell the user nothing they can
 * act on, name internals, and read as data loss. They are still exactly what a
 * developer needs, and Sentry keeps them either way. */

export function buildUnexpectedErrorMessage(raw: string, fallback: string, isDev: boolean): string {
  if (isDev) return raw || fallback
  return fallback
}

/** A user-facing sentence for an unexpected failure. The real message survives in
 * dev builds, where someone is watching the console anyway. */
export function unexpectedErrorMessage(raw: string, fallback: string): string {
  return buildUnexpectedErrorMessage(raw, fallback, import.meta.env.DEV)
}
