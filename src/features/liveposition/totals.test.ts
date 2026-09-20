import { describe, expect, it } from 'vitest'
import { accountUnrealized, liveTotals } from './totals'
import type { LiveAccountPositions, LivePosition } from '../../db/livePositions'

function position(unrealizedPnl: number): LivePosition {
  return {
    ticket: String(Math.random()),
    symbol: 'EURUSD',
    side: 'long',
    volume: 0.1,
    openPrice: 1.085,
    currentPrice: 1.086,
    unrealizedPnl,
    swap: 0,
    stopLoss: null,
    takeProfit: null,
    openedAt: null,
    digits: 5,
  }
}

function account(
  currency: string | null,
  equity: number,
  pnls: number[] = [],
): LiveAccountPositions {
  return {
    accountId: `acc-${currency}-${equity}`,
    label: 'Account',
    broker: 'Broker',
    platform: 'mt5',
    connectionStatus: 'connected',
    balance: equity,
    equity,
    currency,
    positions: pnls.map(position),
    reportedAt: '2026-09-20T12:00:00Z',
  }
}

describe('liveTotals', () => {
  it('totals a single-currency desk into one figure', () => {
    const totals = liveTotals([account('USD', 10_000, [30, -12]), account('USD', 5_000, [5])])
    expect(totals.singleCurrency).toBe('USD')
    expect(totals.byCurrency).toHaveLength(1)
    expect(totals.byCurrency[0].unrealized).toBe(23)
    expect(totals.byCurrency[0].equity).toBe(15_000)
  })

  it('never adds two currencies together', () => {
    // MT5 reports profit in the account's own currency. Summing EUR into USD
    // produces a headline number denominated in nothing.
    const totals = liveTotals([account('USD', 10_000, [100]), account('EUR', 8_000, [50])])
    expect(totals.singleCurrency).toBeNull()
    expect(totals.byCurrency.map((c) => c.currency)).toEqual(['USD', 'EUR'])
    expect(totals.byCurrency.map((c) => c.unrealized)).toEqual([100, 50])
  })

  it('counts every open position regardless of currency', () => {
    expect(liveTotals([account('USD', 1, [1, 2]), account('EUR', 1, [3])]).open).toBe(3)
  })

  it('orders by exposure so the biggest book reads first', () => {
    const totals = liveTotals([account('EUR', 2_000), account('USD', 9_000)])
    expect(totals.byCurrency[0].currency).toBe('USD')
  })

  it('groups accounts whose currency was never read', () => {
    // Shown as its own group rather than folded into whatever came first.
    const totals = liveTotals([account(null, 1_000, [5]), account('USD', 1_000, [5])])
    expect(totals.byCurrency.map((c) => c.currency).sort()).toEqual(['USD', '—'])
  })

  it('is empty for an empty desk', () => {
    expect(liveTotals([])).toEqual({
      byCurrency: [], open: 0, accounts: 0, singleCurrency: null,
    })
  })

  it('counts accounts per currency', () => {
    const totals = liveTotals([account('USD', 1), account('USD', 2), account('EUR', 3)])
    expect(totals.byCurrency.find((c) => c.currency === 'USD')?.accounts).toBe(2)
  })
})

describe('accountUnrealized', () => {
  it('adds up one account’s open positions', () => {
    expect(accountUnrealized(account('USD', 1, [10, -4, 2]))).toBe(8)
  })

  it('is zero when flat', () => {
    expect(accountUnrealized(account('USD', 1, []))).toBe(0)
  })
})
