import { describe, it, expect } from 'vitest'
import {
  riskPerTrade, dailyStop, maxContracts, circuitBreaker, maxTradesPerDay,
  consecutiveRedDays, worstBreaker, applyApexCopierRisk, TICK_VALUES,
} from './risk'

describe('risk framework', () => {
  it('risk per trade = 10% of drawdown', () => {
    expect(riskPerTrade(6_500)).toBe(650)
    expect(riskPerTrade(900)).toBe(90)
  })
  it('daily stop: half firm limit, or 30% of DD when firm has none', () => {
    expect(dailyStop(450, 900)).toBe(225)
    expect(dailyStop(null, 6_500)).toBe(1_950)
  })
  it('position sizing: $650 risk, 40-tick stop on MES -> 13 contracts', () => {
    expect(maxContracts(650, 40, TICK_VALUES.MES)).toBe(13)
    expect(maxContracts(650, 40, TICK_VALUES.ES)).toBe(1)
    expect(maxContracts(100, 40, TICK_VALUES.ES)).toBe(0)
  })
  it('circuit breakers escalate', () => {
    expect(circuitBreaker({ consecutiveLosses: 1, dayPnl: -100, dailyStopAmount: 1950, consecutiveRedDays: 0 })).toBe('ok')
    expect(circuitBreaker({ consecutiveLosses: 2, dayPnl: -500, dailyStopAmount: 1950, consecutiveRedDays: 0 })).toBe('break-30min')
    expect(circuitBreaker({ consecutiveLosses: 3, dayPnl: -500, dailyStopAmount: 1950, consecutiveRedDays: 0 })).toBe('done-for-day')
    expect(circuitBreaker({ consecutiveLosses: 0, dayPnl: -2000, dailyStopAmount: 1950, consecutiveRedDays: 0 })).toBe('done-for-day')
    expect(circuitBreaker({ consecutiveLosses: 0, dayPnl: 0, dailyStopAmount: 1950, consecutiveRedDays: 3 })).toBe('flat-for-week')
  })
  it('max trades per day: daily stop / risk per trade, floored', () => {
    expect(maxTradesPerDay(1_950, 650)).toBe(3)
    expect(maxTradesPerDay(225, 90)).toBe(2)
    expect(maxTradesPerDay(100, 0)).toBe(0)
  })
  it('logging 3 consecutive red days triggers flat-for-week', () => {
    const redDays = consecutiveRedDays([-50, -100, -20])
    expect(redDays).toBe(3)
    expect(circuitBreaker({ consecutiveLosses: 0, dayPnl: -50, dailyStopAmount: 1_950, consecutiveRedDays: redDays }))
      .toBe('flat-for-week')
  })
  it('consecutiveRedDays stops at the first non-red day, most recent first', () => {
    expect(consecutiveRedDays([])).toBe(0)
    expect(consecutiveRedDays([50, -10, -10])).toBe(0)
    expect(consecutiveRedDays([-10, -10, 50])).toBe(2)
  })
  it('worstBreaker picks the most severe level', () => {
    expect(worstBreaker([])).toBe('ok')
    expect(worstBreaker(['ok', 'break-30min'])).toBe('break-30min')
    expect(worstBreaker(['ok', 'done-for-day', 'flat-for-week'])).toBe('flat-for-week')
  })
  it('apex copier risk: done-for-day on one account flags all four', () => {
    expect(applyApexCopierRisk('ok', ['ok', 'done-for-day', 'ok', 'ok'])).toBe('done-for-day')
    expect(applyApexCopierRisk('ok', ['ok', 'break-30min', 'ok', 'ok'])).toBe('ok')
    expect(applyApexCopierRisk('flat-for-week', ['done-for-day'])).toBe('flat-for-week')
  })
})
