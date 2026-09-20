/* Display rules for a screen someone watches rather than reads.
 *
 * Two things make a live number feel unreliable, and neither is latency.
 *
 * Digits that appear and disappear as a price moves: 1.085 one tick, 1.08512
 * the next, the column shifting under the eye each time. A quote is shown at
 * the broker's own precision, always, padded rather than trimmed.
 *
 * And a change you cannot see happen. A number that simply differs from the
 * one you last looked at tells you nothing about when it moved; a brief flash
 * in the direction of travel does, and costs no space.
 */

export type Tick = 'up' | 'down' | 'none'

export function tickOf(previous: number | null | undefined, next: number | null | undefined): Tick {
  if (typeof previous !== 'number' || typeof next !== 'number') return 'none'
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return 'none'
  if (next > previous) return 'up'
  if (next < previous) return 'down'
  return 'none'
}

/** A price at the instrument's own precision. */
export function formatPrice(value: number | null, digits: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  // Five is the FX default and the safest fallback: it over-states precision on
  // an index rather than hiding a pip on a currency pair.
  const places = digits !== null && digits >= 0 && digits <= 8 ? digits : 5
  return value.toFixed(places)
}

/** Money for a column that is scanned down, so always two places and a sign. */
export function formatPnl(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : value > 0 ? '+' : ''
  return `${sign}${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Whole dollars, for balances and totals where cents are noise. */
export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}`
}

export function formatLots(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

/** How long a position has been open, at the coarsest useful scale. */
export function formatDuration(openedAt: string | null, now: number): string {
  if (!openedAt) return '—'
  const at = Date.parse(openedAt)
  if (!Number.isFinite(at)) return '—'
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
