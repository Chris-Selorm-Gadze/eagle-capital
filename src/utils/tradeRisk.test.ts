import { describe, it, expect } from 'vitest'
import { tradeRiskDollars, initialTargetDollars, plannedRMultiple, realizedRMultiple } from './tradeRisk'

describe('trade risk', () => {
  it('tradeRiskDollars: long risks entry-to-stop, short risks stop-to-entry', () => {
    expect(tradeRiskDollars({ entryPrice: 100, stopLoss: 95, qty: 2, side: 'long' })).toBe(10)
    expect(tradeRiskDollars({ entryPrice: 100, stopLoss: 105, qty: 2, side: 'short' })).toBe(10)
    expect(tradeRiskDollars({ entryPrice: 100, qty: 2, side: 'long' })).toBeNull()
  })

  it('initialTargetDollars: long targets above entry, short below', () => {
    expect(initialTargetDollars({ entryPrice: 100, profitTarget: 110, qty: 2, side: 'long' })).toBe(20)
    expect(initialTargetDollars({ entryPrice: 100, profitTarget: 90, qty: 2, side: 'short' })).toBe(20)
    expect(initialTargetDollars({ entryPrice: 100, qty: 2, side: 'long' })).toBeNull()
  })

  it('plannedRMultiple: reward-per-unit / risk-per-unit', () => {
    expect(plannedRMultiple({ entryPrice: 100, stopLoss: 95, profitTarget: 115, side: 'long' })).toBe(3)
    expect(plannedRMultiple({ entryPrice: 100, stopLoss: 105, profitTarget: 85, side: 'short' })).toBe(3)
    expect(plannedRMultiple({ entryPrice: 100, profitTarget: 115, side: 'long' })).toBeNull()
    expect(plannedRMultiple({ entryPrice: 100, stopLoss: 95, side: 'long' })).toBeNull()
    expect(plannedRMultiple({ entryPrice: 100, stopLoss: 100, profitTarget: 115, side: 'long' })).toBeNull()
  })

  it('realizedRMultiple: actual move / planned risk', () => {
    expect(realizedRMultiple({ entryPrice: 100, stopLoss: 95, exitPrice: 110, side: 'long' })).toBe(2)
    expect(realizedRMultiple({ entryPrice: 100, stopLoss: 95, exitPrice: 90, side: 'long' })).toBe(-2)
    expect(realizedRMultiple({ entryPrice: 100, stopLoss: 105, exitPrice: 90, side: 'short' })).toBe(2)
    expect(realizedRMultiple({ entryPrice: 100, exitPrice: 110, side: 'long' })).toBeNull()
    expect(realizedRMultiple({ entryPrice: 100, stopLoss: 100, exitPrice: 110, side: 'long' })).toBeNull()
  })
})
