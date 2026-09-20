import { describe, expect, it } from 'vitest'
import {
  describeLoadFailure,
  freshnessLabel,
  mergeAccounts,
  positionsFromRow,
  snapshotAgeSeconds,
} from './livePositions'
import type { TradingAccount } from './copier'

function account(over: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'acc-1',
    platform: 'mt5',
    accountNumber: '12345',
    brokerServer: 'Exness-MT5Trial',
    label: 'Exness Demo',
    connectionStatus: 'connected',
    balance: 10_000,
    equity: 10_120,
    currency: 'USD',
    isEnabled: true,
    journalAccountId: null,
    ...over,
  } as TradingAccount
}

const RAW = {
  ticket: 7001,
  symbol: 'EURUSD',
  side: 'short',
  volume: 0.25,
  open_price: 1.085,
  current_price: 1.0838,
  unrealized_pnl: 30,
  swap: -1.2,
  sl: 1.09,
  tp: 0,
  opened_at: 1_789_646_400,
}

describe('positionsFromRow', () => {
  it('reads a position the worker reported', () => {
    const [p] = positionsFromRow({ positions: [RAW] })
    expect(p).toMatchObject({
      ticket: '7001',
      symbol: 'EURUSD',
      side: 'short',
      volume: 0.25,
      currentPrice: 1.0838,
      unrealizedPnl: 30,
      stopLoss: 1.09,
    })
    expect(p.openedAt).toBe(new Date(1_789_646_400_000).toISOString())
  })

  it('treats a missing take-profit as absent rather than as a price of zero', () => {
    // MT5 writes 0.0 for "no TP set". Rendering that as a level would show a
    // target of $0 on every position that has none.
    expect(positionsFromRow({ positions: [RAW] })[0].takeProfit).toBeNull()
  })

  it('drops a position with no ticket or symbol instead of rendering a blank row', () => {
    const rows = positionsFromRow({
      positions: [RAW, { symbol: 'GBPUSD' }, { ticket: 9 }, null, 'nonsense'],
    })
    expect(rows).toHaveLength(1)
  })

  it('is empty when the column holds anything but an array', () => {
    expect(positionsFromRow({})).toEqual([])
    expect(positionsFromRow({ positions: null })).toEqual([])
    expect(positionsFromRow({ positions: { ticket: 1 } })).toEqual([])
  })

  it('falls back to long for an unlabelled side', () => {
    expect(positionsFromRow({ positions: [{ ...RAW, side: undefined }] })[0].side).toBe('long')
  })
})

describe('mergeAccounts', () => {
  it('keeps an account the worker has never reported', () => {
    // The page's whole claim is "every account at once". An account missing
    // from live_positions must show as awaiting a read, not disappear.
    const [row] = mergeAccounts([account()], [])
    expect(row.accountId).toBe('acc-1')
    expect(row.reportedAt).toBeNull()
    expect(row.positions).toEqual([])
  })

  it('prefers the snapshot figures, which were read with its positions', () => {
    const [row] = mergeAccounts(
      [account({ balance: 10_000, equity: 10_120 })],
      [{
        trading_account_id: 'acc-1',
        positions: [RAW],
        balance: 9_800,
        equity: 9_830,
        currency: 'EUR',
        reported_at: '2026-09-19T12:00:00Z',
      }],
    )
    expect(row.balance).toBe(9_800)
    expect(row.equity).toBe(9_830)
    expect(row.currency).toBe('EUR')
    expect(row.positions).toHaveLength(1)
  })

  it('falls back to the account row when the snapshot omits a figure', () => {
    const [row] = mergeAccounts(
      [account()],
      [{ trading_account_id: 'acc-1', positions: [], reported_at: '2026-09-19T12:00:00Z' }],
    )
    expect(row.balance).toBe(10_000)
    expect(row.equity).toBe(10_120)
  })

  it('ignores a snapshot for an account that is not listed', () => {
    const rows = mergeAccounts(
      [account()],
      [{ trading_account_id: 'gone', positions: [RAW], reported_at: '2026-09-19T12:00:00Z' }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].positions).toEqual([])
  })

  it('labels an account by its number when it has no name', () => {
    expect(mergeAccounts([account({ label: null })], [])[0].label).toBe('12345')
  })
})

describe('snapshotAgeSeconds', () => {
  const now = Date.parse('2026-09-19T12:00:00Z')

  it('measures how long ago the worker read the account', () => {
    expect(snapshotAgeSeconds('2026-09-19T11:59:56Z', now)).toBe(4)
  })

  it('is null when the account has never been read', () => {
    expect(snapshotAgeSeconds(null, now)).toBeNull()
    expect(snapshotAgeSeconds('not a time', now)).toBeNull()
  })

  it('never goes negative when the worker clock runs ahead', () => {
    // A worker a second ahead of the browser must not render as "-1s ago".
    expect(snapshotAgeSeconds('2026-09-19T12:00:05Z', now)).toBe(0)
  })
})

describe('freshnessLabel', () => {
  it('says what the reader needs at each scale', () => {
    expect(freshnessLabel(null)).toBe('not read yet')
    expect(freshnessLabel(3)).toBe('live')
    expect(freshnessLabel(42)).toBe('42s ago')
    expect(freshnessLabel(95)).toBe('1m ago')
    expect(freshnessLabel(7_300)).toBe('2h ago')
  })

  it('stops calling it live at ten seconds', () => {
    // The boundary is the claim: past it the page says an age instead, because
    // an idle follower is read on the balance sweep, not every cycle.
    expect(freshnessLabel(9)).toBe('live')
    expect(freshnessLabel(10)).toBe('10s ago')
  })
})

describe('describeLoadFailure', () => {
  it('names the unrun migration instead of quoting PostgREST', () => {
    // This is the expected state of a database that has not had the migration
    // applied, and "schema cache" means nothing to the person reading it.
    const failure = describeLoadFailure({
      code: 'PGRST205',
      message: "Could not find the table 'public.live_positions' in the schema cache",
    })
    expect(failure.fatal).toBe(true)
    expect(failure.message).toContain('migrations-live-positions.sql')
  })

  it('also catches Postgres undefined_table', () => {
    expect(describeLoadFailure({ code: '42P01', message: 'relation does not exist' }).fatal).toBe(true)
  })

  it('reads a Supabase error object rather than stringifying it', () => {
    // PostgrestError is a plain object, so String(err) is "[object Object]" —
    // which is what the page showed before this went through errorMessage.
    const failure = describeLoadFailure({ code: '42501', message: 'permission denied for table' })
    expect(failure.message).toBe('permission denied for table')
    expect(failure.fatal).toBe(false)
  })

  it('leaves a transient failure retryable', () => {
    const failure = describeLoadFailure(new Error('Failed to fetch'))
    expect(failure).toEqual({ message: 'Failed to fetch', fatal: false })
  })
})
