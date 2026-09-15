/** Whether a configured backend URL can actually be reached by a deployed user.
 *
 * Every backend client in this app used to gate itself on `Boolean(apiUrl)`.
 * That is true for `http://localhost:8787`, which is how the Trade Copier, Live
 * Positions and Broker Connections pages all came to look configured in
 * production while pointing at a host that only exists on a developer's laptop:
 * the variable was set, so the guard passed, so each page rendered its full UI
 * and then every request failed.
 *
 * A localhost URL is a correct dev setting and a broken prod one, so the check
 * has to know which build it is in.
 *
 * The Trade Copier no longer needs this — its backend moved into this Supabase
 * project, so there is no second URL to misconfigure. Broker Connections and
 * Live Positions still talk to the separate eaglecapital-broker-sync service and
 * still do.
 */
export function isUsableApiUrl(url: string | undefined, isProd: boolean): boolean {
  if (!url || !url.trim()) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!parsed.protocol.startsWith('http')) return false
  if (!isProd) return true
  // URL.hostname keeps the brackets on an IPv6 literal ("[::1]"), so they have
  // to come off before comparing against the loopback addresses.
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0'
}

/** One phrasing for the "this feature can't reach its backend" warning, so the
 * clients don't drift into different explanations of the same fault. */
export function unreachableBackendWarning(feature: string, envVar: string, url: string | undefined): string {
  return url
    ? `${feature} is disabled: ${envVar} points at "${url}", which a deployed build cannot reach.`
    : `${feature} is disabled: set ${envVar} in .env.local.`
}
