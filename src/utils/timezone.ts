/**
 * Converts a naive "YYYY-MM-DD HH:mm:ss" string that's known to represent wall-clock time in a
 * specific IANA zone into the actual UTC instant it refers to — DST-aware, no library needed.
 *
 * Needed because FMP's intraday candle timestamps (e.g. "2026-07-08 09:30:00") are always
 * America/New_York wall time with no offset marker, so `new Date(str)` would silently parse it
 * as the *browser's* local time instead, misaligning every candle against the trade's real
 * entry/exit instant for anyone not sitting in US/Eastern.
 */
export function zonedNaiveToUtcMs(naiveDateStr: string, timeZone: string): number {
  const [datePart, timePart = '00:00:00'] = naiveDateStr.trim().split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second] = timePart.split(':').map(Number)

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(utcGuess))) parts[p.type] = p.value

  const displayedAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second),
  )
  const offsetMs = displayedAsUtc - utcGuess
  return utcGuess - offsetMs
}

/** Formats a UTC instant as a naive "YYYY-MM-DD" date string in the given IANA zone. */
export function utcMsToZonedDateStr(utcMs: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return dtf.format(new Date(utcMs))
}
