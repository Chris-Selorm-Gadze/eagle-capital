export interface DailyPnl {
  date: string
  pnl: number
  tradeCount: number
}

/** `YYYY-MM-DD`, the only shape the day-grouped views can bucket on. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function dailyPnlSeries(trades: { date: string; pnl: number }[]): DailyPnl[] {
  const byDate = new Map<string, { pnl: number; tradeCount: number }>()
  for (const t of trades) {
    // A row whose timestamp couldn't be read yields an empty date (see
    // tradingDayOf). Bucketing it anyway produced a nameless column in the
    // charts and, downstream, a literal "undefined" as a weekday label.
    if (!DATE_RE.test(t.date)) continue
    const entry = byDate.get(t.date) ?? { pnl: 0, tradeCount: 0 }
    entry.pnl += t.pnl
    entry.tradeCount += 1
    byDate.set(t.date, entry)
  }
  return [...byDate.entries()]
    .map(([date, { pnl, tradeCount }]) => ({ date, pnl, tradeCount }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export interface CumulativePoint {
  date: string
  cumulative: number
}

export function cumulativeSeries(daily: DailyPnl[]): CumulativePoint[] {
  let running = 0
  return daily.map((d) => {
    running += d.pnl
    return { date: d.date, cumulative: running }
  })
}

export interface CalendarCell {
  date: string
  day: number
  pnl: number | null // null = no trades that day
  tradeCount: number
}

/** Flat 7-wide grid (Sun-first), padded with null before day 1 and after the last day so the
 * total length is always a whole number of weeks — chunking into weeks of 7 in the UI then
 * always yields full rows, keeping every week's columns aligned under the weekday header. */
export function calendarCells(daily: DailyPnl[], year: number, month: number): (CalendarCell | null)[] {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (CalendarCell | null)[] = new Array(startWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const entry = byDate.get(date)
    cells.push({ date, day, pnl: entry?.pnl ?? null, tradeCount: entry?.tradeCount ?? 0 })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Sum of pnl across a week's cells (nulls — no trades / padding — contribute 0). */
export function weekTotal(week: (CalendarCell | null)[]): number {
  return week.reduce((sum, c) => sum + (c?.pnl ?? 0), 0)
}

/** Sum of pnl across every cell in a month (same rule as weekTotal, over the whole grid). */
export function monthTotal(cells: (CalendarCell | null)[]): number {
  return cells.reduce((sum, c) => sum + (c?.pnl ?? 0), 0)
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface WeekdayStat {
  weekday: string
  pnl: number
  tradeCount: number
}

/** Local day-of-week, or -1 when the date can't be read. Building the Date from
 * components (not `new Date(str)`) keeps it local — the UTC parse renders as the
 * previous day anywhere west of Greenwich. */
function weekdayIndex(dateISO: string): number {
  if (!DATE_RE.test(dateISO)) return -1
  const [y, m, d] = dateISO.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? -1 : date.getDay()
}

/** Aggregates daily totals by day-of-week (Sun-Sat), summing across every occurrence —
 * which weekday you're most active/profitable on is more actionable than a single date. */
export function weekdayStats(daily: DailyPnl[]): WeekdayStat[] {
  const byWeekday = new Map<number, { pnl: number; tradeCount: number }>()
  for (const d of daily) {
    const idx = weekdayIndex(d.date)
    if (idx === -1) continue
    const entry = byWeekday.get(idx) ?? { pnl: 0, tradeCount: 0 }
    entry.pnl += d.pnl
    entry.tradeCount += d.tradeCount
    byWeekday.set(idx, entry)
  }
  return [...byWeekday.entries()].map(([idx, s]) => ({ weekday: WEEKDAY_NAMES[idx], ...s }))
}

export function mostActiveWeekday(daily: DailyPnl[]): WeekdayStat | null {
  const stats = weekdayStats(daily)
  return stats.length === 0 ? null : stats.reduce((best, s) => (s.tradeCount > best.tradeCount ? s : best))
}

export function mostProfitableWeekday(daily: DailyPnl[]): WeekdayStat | null {
  const stats = weekdayStats(daily)
  return stats.length === 0 ? null : stats.reduce((best, s) => (s.pnl > best.pnl ? s : best))
}

export function leastProfitableWeekday(daily: DailyPnl[]): WeekdayStat | null {
  const stats = weekdayStats(daily)
  return stats.length === 0 ? null : stats.reduce((worst, s) => (s.pnl < worst.pnl ? s : worst))
}
