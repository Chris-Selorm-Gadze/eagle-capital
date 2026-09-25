import { describe, it, expect } from 'vitest'
import { buildLedger, buildLedgers, balanceSeries } from './ledger'
import type { Account, Payout, SessionLog, Trade } from '../types'

const account = (over: Partial<Account> = {}): Account => ({
  id: 'a1', label: 'Test', size: 50_000, balance: 50_000, highestBalance: 50_000,
  stage: 'funded', active: true, ...over,
})

// Midday local time, so the trading day is unambiguous in any test runner zone.
const trade = (date: string, pnl: number, over: Partial<Trade> = {}): Trade => ({
  accountId: 'a1', date, symbol: 'MES', side: 'long', qty: 1,
  entryPrice: 1, exitPrice: 2, entryTime: `${date}T12:00:00`, exitTime: `${date}T13:00:00`,
  pnl, ...over,
})

const session = (date: string, pnl: number, over: Partial<SessionLog> = {}): SessionLog => ({
  accountId: 'a1', date, pnl, trades: 1, consecutiveLosses: 0, rulesFollowed: true, ...over,
})

const payout = (date: string, requested: number, received: number): Payout =>
  ({ accountId: 'a1', date, requested, received })

describe('buildLedger', () => {
  it('is the opening balance with nothing logged', () => {
    const l = buildLedger(account(), [], [], [])
    expect(l.balance).toBe(50_000)
    expect(l.peakBalance).toBe(50_000)
    expect(l.tradingDays).toBe(0)
  })

  it('adds trade P&L to the balance — the case the stored column never handled', () => {
    const l = buildLedger(account(), [trade('2026-03-02', 800), trade('2026-03-03', -300)], [], [])
    expect(l.tradePnl).toBe(500)
    expect(l.balance).toBe(50_500)
  })

  it('counts a session only on days with no trades, so mixing never double-counts', () => {
    const trades = [trade('2026-03-02', 800)]
    const sessions = [session('2026-03-02', 800), session('2026-03-04', 200)]
    const l = buildLedger(account(), trades, sessions, [])
    expect(l.tradePnl).toBe(800)
    expect(l.sessionPnl).toBe(200) // the 2026-03-02 session is ignored
    expect(l.balance).toBe(51_000)
  })

  it('deducts what a payout removed from the account, not what the trader received', () => {
    const l = buildLedger(account(), [trade('2026-03-02', 5_000)], [], [payout('2026-03-05', 5_000, 4_000)])
    expect(l.withdrawn).toBe(5_000)
    expect(l.received).toBe(4_000)
    expect(l.balance).toBe(50_000)
  })

  it('tracks the running peak, not just the final or opening balance', () => {
    const trades = [trade('2026-03-02', 9_000), trade('2026-03-03', -7_000)]
    const l = buildLedger(account(), trades, [], [])
    expect(l.balance).toBe(52_000)
    expect(l.peakBalance).toBe(59_000)
  })

  it('never reports a peak below the opening balance', () => {
    const l = buildLedger(account(), [trade('2026-03-02', -4_000)], [], [])
    expect(l.peakBalance).toBe(50_000)
  })

  it('counts distinct active days across both trades and sessions', () => {
    const l = buildLedger(account(), [trade('2026-03-02', 10), trade('2026-03-02', 10)], [session('2026-03-05', 5)], [])
    expect(l.tradingDays).toBe(2)
  })
})

describe('buildLedgers', () => {
  it('keeps each account to its own rows', () => {
    const accounts = [account({ id: 'a1' }), account({ id: 'a2', size: 25_000 })]
    const trades = [trade('2026-03-02', 500), trade('2026-03-02', 999, { accountId: 'a2' })]
    const ledgers = buildLedgers(accounts, trades, [], [])
    expect(ledgers.get('a1')!.balance).toBe(50_500)
    expect(ledgers.get('a2')!.balance).toBe(25_999)
  })
})

describe('balanceSeries', () => {
  it('starts from every selected account, not only the ones that traded', () => {
    const accounts = [account({ id: 'a1' }), account({ id: 'a2', size: 25_000 })]
    const series = balanceSeries(accounts, [trade('2026-03-02', 1_000)], [], [])
    expect(series).toHaveLength(1)
    expect(series[0].balance).toBe(76_000) // 50k + 25k + 1k
  })

  it('tracks cumulative received payouts alongside the balance', () => {
    const series = balanceSeries(
      [account()],
      [trade('2026-03-02', 6_000)],
      [],
      [payout('2026-03-05', 6_000, 4_800)],
    )
    expect(series.map((p) => [p.date, p.balance, p.withdrawals])).toEqual([
      ['2026-03-02', 56_000, 0],
      ['2026-03-05', 50_000, 4_800],
    ])
  })

  it('is empty when nothing has been logged', () => {
    expect(balanceSeries([account()], [], [], [])).toEqual([])
  })
})

describe('an opening balance read from a broker', () => {
  // Linked at 2026-03-04 15:00 local with the broker reading 50,000 — a figure
  // that already contains everything closed before that moment.
  const linked = account({ openingBalanceAt: new Date(2026, 2, 4, 15, 0).toISOString() })

  it('does not add trades that closed before the balance was read', () => {
    const trades = [
      trade('2026-03-03', 700), // backfilled: already inside the 50,000
      trade('2026-03-04', 200, { exitTime: '2026-03-04T14:00:00' }), // also before 15:00
      trade('2026-03-04', 300, { entryTime: '2026-03-04T15:30:00', exitTime: '2026-03-04T16:00:00' }),
    ]
    const l = buildLedger(linked, trades, [], [])
    expect(l.tradePnl).toBe(300)
    expect(l.balance).toBe(50_300)
  })

  it('still counts every trade as trading activity', () => {
    const l = buildLedger(linked, [trade('2026-03-03', 700)], [], [])
    expect(l.tradingDays).toBe(1)
  })

  it('draws the balance curve from the same rule as the figure', () => {
    const trades = [trade('2026-03-03', 700), trade('2026-03-05', 100)]
    const series = balanceSeries([linked], trades, [], [])
    expect(series.at(-1)!.balance).toBe(50_100)
    expect(series.at(-1)!.balance).toBe(buildLedger(linked, trades, [], []).balance)
  })

  it('leaves an account without an anchor exactly as before', () => {
    const l = buildLedger(account(), [trade('2026-03-03', 700)], [], [])
    expect(l.balance).toBe(50_700)
  })
})

describe('the day a result belongs to', () => {
  it('books a position held overnight on the day it closed', () => {
    const held = trade('2026-03-02', 400, {
      entryTime: '2026-03-02T20:00:00', exitTime: '2026-03-03T10:00:00',
    })
    const series = balanceSeries([account()], [held], [], [])
    expect(series.map((p) => p.date)).toEqual(['2026-03-03'])
  })
})
