export interface DailyPnl {
  date: string
  pnl: number
  tradeCount: number
}

export function dailyPnlSeries(trades: { date: string; pnl: number }[]): DailyPnl[] {
  const byDate = new Map<string, { pnl: number; tradeCount: number }>()
  for (const t of trades) {
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

/** Flat 7-wide grid (Sun-first), padded with null before day 1 — chunk into weeks of 7 in the UI. */
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
  return cells
}

/** Sum of pnl across a week's cells (nulls — no trades / padding — contribute 0). */
export function weekTotal(week: (CalendarCell | null)[]): number {
  return week.reduce((sum, c) => sum + (c?.pnl ?? 0), 0)
}

/** The single date with the most trades taken. */
export function mostActiveDay(daily: DailyPnl[]): DailyPnl | null {
  if (daily.length === 0) return null
  return daily.reduce((best, d) => (d.tradeCount > best.tradeCount ? d : best))
}

export function mostProfitableDay(daily: DailyPnl[]): DailyPnl | null {
  if (daily.length === 0) return null
  return daily.reduce((best, d) => (d.pnl > best.pnl ? d : best))
}

export function leastProfitableDay(daily: DailyPnl[]): DailyPnl | null {
  if (daily.length === 0) return null
  return daily.reduce((worst, d) => (d.pnl < worst.pnl ? d : worst))
}
