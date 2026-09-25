/* The order "recent trades" means: most recently closed first.
 *
 * Kept total -- ties broken on entry, then id -- so a sort never depends on
 * the engine's handling of equal keys. The dashboard's recent-trades tile used
 * to sort on the day string with a comparator that never returned 0, which put
 * a day's trades in no particular order and could leave the trade that had
 * just closed out of the "last eight" altogether. */

interface Ordered {
  id?: string
  entryTime: string
  exitTime: string
}

function instant(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

function compareDesc(a: number, b: number): number {
  if (a === b) return 0
  return a < b ? 1 : -1
}

export function byMostRecentClose(a: Ordered, b: Ordered): number {
  return (
    compareDesc(instant(a.exitTime), instant(b.exitTime))
    || compareDesc(instant(a.entryTime), instant(b.entryTime))
    || String(a.id ?? '').localeCompare(String(b.id ?? ''))
  )
}
