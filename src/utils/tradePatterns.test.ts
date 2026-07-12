import { describe, it, expect } from 'vitest'
import { detectRevengeTrades, detectOvertrading, detectSizeEscalation } from './tradePatterns'
import type { Trade } from '../types'

function trade(overrides: Partial<Trade> & { id: string }): Trade {
  return {
    accountId: 'acc-1',
    date: '2026-07-01',
    symbol: 'EURUSD',
    side: 'long',
    qty: 1,
    entryPrice: 1.1,
    exitPrice: 1.1,
    entryTime: '2026-07-01T10:00:00.000Z',
    exitTime: '2026-07-01T10:05:00.000Z',
    pnl: 0,
    ...overrides,
  }
}

describe('detectRevengeTrades', () => {
  it('flags a trade opened within minutes of a prior loss on the same account', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', exitTime: '2026-07-01T10:05:00.000Z', pnl: -50, qty: 1 }),
      trade({ id: '2', entryTime: '2026-07-01T10:08:00.000Z', exitTime: '2026-07-01T10:20:00.000Z', pnl: 30, qty: 3 }),
    ]
    const flags = detectRevengeTrades(trades)
    expect(flags).toHaveLength(1)
    expect(flags[0].tradeId).toBe('2')
    expect(flags[0].priorTradeId).toBe('1')
    expect(flags[0].gapMinutes).toBe(3)
  })

  it('does not flag re-entry after a winning trade', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', exitTime: '2026-07-01T10:05:00.000Z', pnl: 50 }),
      trade({ id: '2', entryTime: '2026-07-01T10:08:00.000Z', exitTime: '2026-07-01T10:20:00.000Z', pnl: 30 }),
    ]
    expect(detectRevengeTrades(trades)).toHaveLength(0)
  })

  it('does not flag re-entry after the gap threshold', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', exitTime: '2026-07-01T10:05:00.000Z', pnl: -50 }),
      trade({ id: '2', entryTime: '2026-07-01T11:00:00.000Z', exitTime: '2026-07-01T11:20:00.000Z', pnl: 30 }),
    ]
    expect(detectRevengeTrades(trades, 15)).toHaveLength(0)
  })

  it('scopes detection per account — no cross-account false positives', () => {
    const trades = [
      trade({ id: '1', accountId: 'acc-1', entryTime: '2026-07-01T10:00:00.000Z', exitTime: '2026-07-01T10:05:00.000Z', pnl: -50 }),
      trade({ id: '2', accountId: 'acc-2', entryTime: '2026-07-01T10:08:00.000Z', exitTime: '2026-07-01T10:20:00.000Z', pnl: 30 }),
    ]
    expect(detectRevengeTrades(trades)).toHaveLength(0)
  })
})

describe('detectOvertrading', () => {
  it('flags a day with well above the account\'s own average trade count', () => {
    const trades: Trade[] = []
    // 6 quiet days at 1 trade each (baseline), then a 6-trade day
    for (let d = 1; d <= 6; d++) {
      trades.push(trade({ id: `quiet-${d}`, date: `2026-07-0${d}`, entryTime: `2026-07-0${d}T10:00:00.000Z`, exitTime: `2026-07-0${d}T10:05:00.000Z` }))
    }
    for (let i = 0; i < 6; i++) {
      trades.push(trade({ id: `busy-${i}`, date: '2026-07-07', entryTime: `2026-07-07T1${i}:00:00.000Z`, exitTime: `2026-07-07T1${i}:05:00.000Z` }))
    }
    const flags = detectOvertrading(trades)
    expect(flags).toHaveLength(1)
    expect(flags[0].date).toBe('2026-07-07')
    expect(flags[0].tradeCount).toBe(6)
  })

  it('does not flag anything with too little history to establish a baseline', () => {
    const trades = [
      trade({ id: '1', date: '2026-07-01' }),
      trade({ id: '2', date: '2026-07-02' }),
    ]
    expect(detectOvertrading(trades)).toHaveLength(0)
  })
})

describe('detectSizeEscalation', () => {
  it('flags size climbing across a losing streak', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', pnl: -10, qty: 1 }),
      trade({ id: '2', entryTime: '2026-07-01T11:00:00.000Z', pnl: -10, qty: 2 }),
      trade({ id: '3', entryTime: '2026-07-01T12:00:00.000Z', pnl: -10, qty: 4 }),
    ]
    const flags = detectSizeEscalation(trades)
    expect(flags).toHaveLength(1)
    expect(flags[0].streakLength).toBe(3)
    expect(flags[0].startQty).toBe(1)
    expect(flags[0].endQty).toBe(4)
  })

  it('does not flag a losing streak with flat size', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', pnl: -10, qty: 2 }),
      trade({ id: '2', entryTime: '2026-07-01T11:00:00.000Z', pnl: -10, qty: 2 }),
      trade({ id: '3', entryTime: '2026-07-01T12:00:00.000Z', pnl: -10, qty: 2 }),
    ]
    expect(detectSizeEscalation(trades)).toHaveLength(0)
  })

  it('a win breaks the streak', () => {
    const trades = [
      trade({ id: '1', entryTime: '2026-07-01T10:00:00.000Z', pnl: -10, qty: 1 }),
      trade({ id: '2', entryTime: '2026-07-01T11:00:00.000Z', pnl: 50, qty: 5 }),
      trade({ id: '3', entryTime: '2026-07-01T12:00:00.000Z', pnl: -10, qty: 1 }),
    ]
    expect(detectSizeEscalation(trades)).toHaveLength(0)
  })
})
