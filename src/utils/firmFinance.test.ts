import { describe, it, expect } from 'vitest'
import { firmFinanceBreakdown, firmPassRate, pathToFundingProgress, breachReasonCounts } from './firmFinance'
import type { Account, Payout } from '../db/schema'
import type { AccountLedger } from './ledger'

function account(overrides: Partial<Account>): Account {
  return {
    id: '1', firmId: 'apex', label: 'test', size: 10_000, balance: 10_000,
    highestBalance: 10_000, stage: 'evaluation', active: true, ...overrides,
  }
}

describe('firmFinanceBreakdown', () => {
  it('sums cost (spent) and payouts.received (earned) per firm', () => {
    const accounts = [
      account({ id: '1', firmId: 'apex', cost: 200 }),
      account({ id: '2', firmId: 'apex', cost: 150 }),
      account({ id: '3', firmId: 'ftmo', cost: 100 }),
    ]
    const payoutsByAccountId = new Map<string, Payout[]>([
      ['1', [{ id: '1', accountId: '1', date: '2026-06-01', requested: 500, received: 500 }, { id: '2', accountId: '1', date: '2026-06-10', requested: 300, received: 300 }]],
      ['2', []],
      ['3', [{ id: '3', accountId: '3', date: '2026-06-05', requested: 50, received: 50 }]],
    ])
    const result = firmFinanceBreakdown(accounts, payoutsByAccountId)
    expect(result).toEqual(expect.arrayContaining([
      { firmId: 'apex', spent: 350, earned: 800, net: 450 },
      { firmId: 'ftmo', spent: 100, earned: 50, net: -50 },
    ]))
  })
})

describe('firmPassRate', () => {
  it('excludes planned accounts, counts funded/pa as passed', () => {
    const accounts = [
      account({ firmId: 'apex', stage: 'funded' }),
      account({ firmId: 'apex', stage: 'blown' }),
      account({ firmId: 'apex', stage: 'evaluation' }),
      account({ firmId: 'apex', stage: 'planned' }),
      account({ firmId: 'ftmo', stage: 'pa' }),
    ]
    const result = firmPassRate(accounts)
    expect(result).toEqual(expect.arrayContaining([
      { firmId: 'apex', passed: 1, total: 3, pct: 1 / 3 },
      { firmId: 'ftmo', passed: 1, total: 1, pct: 1 },
    ]))
  })
})

describe('pathToFundingProgress', () => {
  // The ledger is the derived record now — progress reads realised P&L and
  // active days from it instead of counting session rows, so a trader who logs
  // individual fills gets the same progress as one who logs daily summaries.
  const ledger = (over: Partial<AccountLedger> = {}): AccountLedger => ({
    openingBalance: 10_000, tradePnl: 0, sessionPnl: 20, realizedPnl: 20,
    withdrawn: 0, received: 0, balance: 10_020, peakBalance: 10_150, tradingDays: 4, ...over,
  })

  it('returns null for non-evaluation stages', () => {
    expect(pathToFundingProgress(account({ stage: 'funded' }), ledger(), 0)).toBeNull()
  })

  it('computes profit/days/dailyLoss percentages from the ledger', () => {
    const acc = account({
      stage: 'evaluation', size: 10_000, balance: 9_700, highestBalance: 10_000,
      profitTarget: 1_000, minTradingDays: 10, dailyLossLimit: 200, maxDrawdown: 1_000, trailingDrawdown: false,
    })
    const result = pathToFundingProgress(acc, ledger({ realizedPnl: 250, tradingDays: 4 }), -50)
    expect(result?.profitPct).toBe(0.25)
    expect(result?.daysPct).toBe(0.4)
    expect(result?.dailyLossPct).toBe(0.25)
  })

  it('counts a winning day as zero daily loss used, not a negative', () => {
    const acc = account({ stage: 'challenge', dailyLossLimit: 200 })
    expect(pathToFundingProgress(acc, ledger(), 300)?.dailyLossPct).toBe(0)
  })

  it('counts trades toward profit — the case reading account.balance missed', () => {
    const acc = account({ stage: 'challenge', size: 10_000, balance: 10_000, profitTarget: 1_000 })
    const fromTrades = ledger({ tradePnl: 200, sessionPnl: 0, realizedPnl: 200 })
    expect(pathToFundingProgress(acc, fromTrades, 0)?.profitPct).toBe(0.2)
  })

  it('leaves days/dailyLoss null when those fields are not set', () => {
    const acc = account({ stage: 'challenge', profitTarget: 1_000, balance: 10_200 })
    const result = pathToFundingProgress(acc, ledger({ realizedPnl: 200 }), 0)
    expect(result?.daysPct).toBeNull()
    expect(result?.dailyLossPct).toBeNull()
    expect(result?.profitPct).toBe(0.2)
  })

  it('clamps progress past the target to 100%', () => {
    const acc = account({ stage: 'challenge', profitTarget: 1_000 })
    expect(pathToFundingProgress(acc, ledger({ realizedPnl: 5_000 }), 0)?.profitPct).toBe(1)
  })
})

describe('breachReasonCounts', () => {
  it('counts blownReason across blown accounts, most common first', () => {
    const accounts = [
      account({ stage: 'blown', blownReason: 'Overtraded' }),
      account({ stage: 'blown', blownReason: 'Overtraded' }),
      account({ stage: 'blown', blownReason: 'News event' }),
      account({ stage: 'blown' }), // no reason -> excluded
      account({ stage: 'funded', blownReason: 'Overtraded' }), // not blown -> excluded
    ]
    expect(breachReasonCounts(accounts)).toEqual([
      { reason: 'Overtraded', count: 2 },
      { reason: 'News event', count: 1 },
    ])
  })
})
