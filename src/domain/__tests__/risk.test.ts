import { describe, it, expect } from 'vitest'
import { riskPerTrade, dailyStop, maxContracts, circuitBreaker, TICK_VALUES } from '../risk'

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
})
