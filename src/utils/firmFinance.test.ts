import { describe, it, expect } from 'vitest'
import { firmFinanceBreakdown, firmPassRate, pathToFundingProgress, breachReasonCounts } from './firmFinance'
import type { Account, Payout, SessionLog } from '../db/schema'

function account(overrides: Partial<Account>): Account {
  return {
    id: 1, firmId: 'apex', label: 'test', size: 10_000, balance: 10_000,
    highestBalance: 10_000, stage: 'evaluation', active: true, ...overrides,
  }
}

describe('firmFinanceBreakdown', () => {
  it('sums cost (spent) and payouts.received (earned) per firm', () => {
    const accounts = [
      account({ id: 1, firmId: 'apex', cost: 200 }),
      account({ id: 2, firmId: 'apex', cost: 150 }),
      account({ id: 3, firmId: 'ftmo', cost: 100 }),
    ]
    const payoutsByAccountId = new Map<number, Payout[]>([
      [1, [{ id: 1, accountId: 1, date: '2026-06-01', requested: 500, received: 500 }, { id: 2, accountId: 1, date: '2026-06-10', requested: 300, received: 300 }]],
      [2, []],
      [3, [{ id: 3, accountId: 3, date: '2026-06-05', requested: 50, received: 50 }]],
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
  const sessions: SessionLog[] = [
    { id: 1, accountId: 1, date: '2026-07-01', pnl: 100, trades: 2, consecutiveLosses: 0, rulesFollowed: true },
    { id: 2, accountId: 1, date: '2026-07-02', pnl: 50, trades: 1, consecutiveLosses: 0, rulesFollowed: true },
    { id: 3, accountId: 1, date: '2026-07-03', pnl: -80, trades: 3, consecutiveLosses: 1, rulesFollowed: true },
    { id: 4, accountId: 1, date: '2026-07-06', pnl: -50, trades: 1, consecutiveLosses: 1, rulesFollowed: true },
  ]

  it('returns null for non-evaluation stages', () => {
    expect(pathToFundingProgress(account({ stage: 'funded' }), sessions, '2026-07-06')).toBeNull()
  })

  it('computes profit/days/dailyLoss/drawdown percentages', () => {
    const acc = account({
      stage: 'evaluation', size: 10_000, balance: 9_700, highestBalance: 10_000,
      profitTarget: 1_000, minTradingDays: 10, dailyLossLimit: 200, maxDrawdown: 1_000, trailingDrawdown: false,
    })
    const result = pathToFundingProgress(acc, sessions, '2026-07-06')
    expect(result?.profitPct).toBe(0)
    expect(result?.daysPct).toBe(0.4)
    expect(result?.dailyLossPct).toBe(0.25)
    expect(result?.drawdownPct).toBeCloseTo(0.3, 5)
  })

  it('leaves days/dailyLoss null when those fields are not set', () => {
    const acc = account({ stage: 'challenge', profitTarget: 1_000, balance: 10_200 })
    const result = pathToFundingProgress(acc, [], '2026-07-06')
    expect(result?.daysPct).toBeNull()
    expect(result?.dailyLossPct).toBeNull()
    expect(result?.profitPct).toBe(0.2)
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
