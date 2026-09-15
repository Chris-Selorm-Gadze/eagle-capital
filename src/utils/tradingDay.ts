/* The trading day.
 *
 * Every day-grouped view in the app — the calendar heatmap, daily P&L, the
 * equity curve, weekday stats, the insights date range — buckets on a
 * `YYYY-MM-DD` string. That string has to mean "the day the trader was sitting
 * at the desk", and it used to be produced by slicing a UTC ISO timestamp:
 *
 *     new Date(entryTime).toISOString().slice(0, 10)
 *
 * which is the UTC date, not the trader's. A US trader filling at 20:30 ET on
 * Jan 15 stores `2026-01-16T01:30:00Z`, so every evening trade was filed on the
 * NEXT day. The CME session opens at 18:00 ET, so for a futures trader that's
 * not an edge case — it's most of the session.
 *
 * These helpers resolve an instant to a calendar day in the *viewer's* local
 * zone instead. Local is the right default: the wall-clock time a trader types
 * into a datetime-local field is already local, so the date they meant is the
 * date they typed.
 */

/** The local calendar day (`YYYY-MM-DD`) containing this instant. */
export function tradingDayOf(instant: string | number | Date): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return ''
  return formatLocalDate(d)
}

/** Today's local calendar day. Replaces `new Date().toISOString().slice(0, 10)`,
 * which returns tomorrow's date for anyone east of UTC late in their evening. */
export function todayTradingDay(): string {
  return formatLocalDate(new Date())
}

/** `YYYY-MM-DD` from a Date's LOCAL components — never via toISOString(), which
 * shifts to UTC first and is the whole bug this module exists to fix. */
export function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parses a `YYYY-MM-DD` into a Date at local midnight. `new Date('2026-01-15')`
 * parses as UTC midnight and renders as the 14th west of UTC, so date-only
 * strings must never go through the Date constructor directly. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Shifts a `YYYY-MM-DD` by a whole number of days, staying in local time
 * (so it doesn't drift across a DST boundary the way ±86400000ms does). */
export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return formatLocalDate(d)
}

/** Local day-of-week index (0 = Sunday) for a `YYYY-MM-DD`. */
export function weekdayOf(dateStr: string): number {
  return parseLocalDate(dateStr).getDay()
}
