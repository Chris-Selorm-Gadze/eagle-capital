import { describe, it, expect } from 'vitest'
import {
  weekTotal, dailyPnlSeries, calendarCells, mostActiveDay, mostProfitableDay, leastProfitableDay,
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
})

describe('most/least active & profitable day', () => {
  const daily = dailyPnlSeries([
    { date: '2026-07-06', pnl: 100 },
    { date: '2026-07-06', pnl: 50 },
    { date: '2026-07-06', pnl: -20 },
    { date: '2026-07-07', pnl: -200 },
    { date: '2026-07-08', pnl: 10 },
  ])

  it('mostActiveDay picks the date with the highest trade count', () => {
    expect(mostActiveDay(daily)).toMatchObject({ date: '2026-07-06', tradeCount: 3 })
  })

  it('mostProfitableDay picks the highest net pnl date', () => {
    expect(mostProfitableDay(daily)).toMatchObject({ date: '2026-07-06', pnl: 130 })
  })

  it('leastProfitableDay picks the lowest net pnl date', () => {
    expect(leastProfitableDay(daily)).toMatchObject({ date: '2026-07-07', pnl: -200 })
  })

  it('all return null for an empty series', () => {
    expect(mostActiveDay([])).toBeNull()
    expect(mostProfitableDay([])).toBeNull()
    expect(leastProfitableDay([])).toBeNull()
  })
})
