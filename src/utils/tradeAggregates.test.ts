import { describe, it, expect } from 'vitest'
import {
  weekTotal, dailyPnlSeries, calendarCells, weekdayStats,
  mostActiveWeekday, mostProfitableWeekday, leastProfitableWeekday,
  type CalendarCell,
} from './tradeAggregates'

describe('weekTotal', () => {
  it('sums pnl across a week, treating null (no-trade) cells as 0', () => {
    const week: (CalendarCell | null)[] = [
      null,
      { date: '2026-07-06', day: 6, pnl: 100, tradeCount: 2 },
      { date: '2026-07-07', day: 7, pnl: -40, tradeCount: 1 },
      { date: '2026-07-08', day: 8, pnl: null, tradeCount: 0 },
      { date: '2026-07-09', day: 9, pnl: 25, tradeCount: 1 },
      null,
      null,
    ]
    expect(weekTotal(week)).toBe(85)
  })

  it('returns 0 for an all-null/padding week', () => {
    expect(weekTotal([null, null, null, null, null, null, null])).toBe(0)
  })
})

describe('dailyPnlSeries', () => {
  it('sums pnl and counts trades per date', () => {
    const daily = dailyPnlSeries([
      { date: '2026-07-06', pnl: 100 },
      { date: '2026-07-06', pnl: -30 },
      { date: '2026-07-07', pnl: 50 },
    ])
    expect(daily).toEqual([
      { date: '2026-07-06', pnl: 70, tradeCount: 2 },
      { date: '2026-07-07', pnl: 50, tradeCount: 1 },
    ])
  })
})

describe('calendarCells', () => {
  it('carries tradeCount into each populated cell, 0 for no-trade days', () => {
    const daily = dailyPnlSeries([{ date: '2026-07-06', pnl: 100 }, { date: '2026-07-06', pnl: -20 }])
    const cells = calendarCells(daily, 2026, 6) // July 2026
    const day6 = cells.find((c) => c?.day === 6)
    const day7 = cells.find((c) => c?.day === 7)
    expect(day6).toMatchObject({ pnl: 80, tradeCount: 2 })
    expect(day7).toMatchObject({ pnl: null, tradeCount: 0 })
  })

  it('pads the grid to a whole number of weeks, so the last week is never short a column', () => {
    for (let month = 0; month < 12; month++) {
      const cells = calendarCells([], 2026, month)
      expect(cells.length % 7).toBe(0)
    }
  })
})

describe('weekday aggregation (mostActive/mostProfitable/leastProfitableWeekday)', () => {
  // 2026-07-06 & 2026-07-13 are both Mondays; 07-07 is a Tuesday; 07-08 is a Wednesday.
  const daily = dailyPnlSeries([
    { date: '2026-07-06', pnl: 100 },
    { date: '2026-07-06', pnl: 50 },
    { date: '2026-07-13', pnl: -20 },
    { date: '2026-07-07', pnl: -200 },
    { date: '2026-07-08', pnl: 10 },
  ])

  it('weekdayStats sums pnl/tradeCount across every occurrence of a weekday', () => {
    const stats = weekdayStats(daily)
    expect(stats).toContainEqual({ weekday: 'Monday', pnl: 130, tradeCount: 3 })
    expect(stats).toContainEqual({ weekday: 'Tuesday', pnl: -200, tradeCount: 1 })
    expect(stats).toContainEqual({ weekday: 'Wednesday', pnl: 10, tradeCount: 1 })
  })

  it('mostActiveWeekday picks the weekday with the highest total trade count', () => {
    expect(mostActiveWeekday(daily)).toMatchObject({ weekday: 'Monday', tradeCount: 3 })
  })

  it('mostProfitableWeekday picks the highest total pnl weekday', () => {
    expect(mostProfitableWeekday(daily)).toMatchObject({ weekday: 'Monday', pnl: 130 })
  })

  it('leastProfitableWeekday picks the lowest total pnl weekday', () => {
    expect(leastProfitableWeekday(daily)).toMatchObject({ weekday: 'Tuesday', pnl: -200 })
  })

  it('all return null for an empty series', () => {
    expect(mostActiveWeekday([])).toBeNull()
    expect(mostProfitableWeekday([])).toBeNull()
    expect(leastProfitableWeekday([])).toBeNull()
  })
})
