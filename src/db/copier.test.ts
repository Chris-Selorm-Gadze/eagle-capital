import { describe, it, expect } from 'vitest'
import {
  buildCopierGroups, unlinkedAccounts, workerLiveness, heartbeatAgeSeconds,
  latencySummary, isRelationLive, HEARTBEAT_TTL_SECONDS,
  hasPendingTest, anyWorkerLive,
  type TradingAccount, type CopierRelation, type ExecutionEvent,
  type PendingCommand, type WorkerNode,
} from './copier'

function account(id: string, over: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id,
    platform: 'mt5',
    accountNumber: `100${id}`,
    brokerServer: 'Test-MT5',
    label: `Account ${id}`,
    connectionStatus: 'connected',
    balance: 1000,
    equity: 1000,
    currency: 'USD',
    isEnabled: true,
    terminalPath: null,
    brokerPingMs: null,
    journalAccountId: null,
    lastConnectedAt: null,
    lastError: null,
    ...over,
  }
}

function relation(id: string, master: string, follower: string, over: Partial<CopierRelation> = {}): CopierRelation {
  return {
    id,
    masterAccountId: master,
    followerAccountId: follower,
    label: null,
    riskMode: 'multiplier',
    multiplier: 1,
    fixedLotSize: 0.01,
    isEnabled: true,
    ...over,
  }
}

function event(over: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    id: Math.random().toString(36).slice(2),
    copierRelationId: null,
    masterAccountId: null,
    followerAccountId: null,
    eventType: 'position_opened',
    symbolMaster: 'XAUUSD',
    symbolFollower: 'XAUUSD',
    side: 'buy',
    requestedLot: 0.1,
    executedLot: 0.1,
    slippagePoints: 0,
    switchMs: null,
    orderMs: null,
    e2eMs: null,
    status: 'success',
    errorMessage: null,
    createdAt: '2026-09-12T10:00:00Z',
    ...over,
  }
}

describe('buildCopierGroups', () => {
  it('groups followers under their master', () => {
    const accounts = [account('a'), account('b'), account('c')]
    const relations = [relation('r1', 'a', 'b'), relation('r2', 'a', 'c')]

    const groups = buildCopierGroups(accounts, relations)

    expect(groups).toHaveLength(1)
    expect(groups[0]!.master.id).toBe('a')
    expect(groups[0]!.followers.map((f) => f.account.id)).toEqual(['b', 'c'])
  })

  it('drops a link whose account no longer exists', () => {
    // The account row was deleted but the relation survived. Rendering half a
    // link would offer an "enable" button pointing at nothing.
    const accounts = [account('a')]
    const relations = [relation('r1', 'a', 'ghost')]

    expect(buildCopierGroups(accounts, relations)).toEqual([])
  })

  it('keeps separate masters in separate groups', () => {
    const accounts = [account('a'), account('b'), account('c'), account('d')]
    const relations = [relation('r1', 'a', 'b'), relation('r2', 'c', 'd')]

    expect(buildCopierGroups(accounts, relations)).toHaveLength(2)
  })
})

describe('unlinkedAccounts', () => {
  it('returns only accounts in no relation, as master or follower', () => {
    const accounts = [account('a'), account('b'), account('c')]
    const relations = [relation('r1', 'a', 'b')]

    expect(unlinkedAccounts(accounts, relations).map((a) => a.id)).toEqual(['c'])
  })
})

describe('workerLiveness', () => {
  const now = new Date('2026-09-12T12:00:00Z')

  it('is offline when the worker has never checked in', () => {
    expect(workerLiveness(null, now)).toBe('offline')
  })

  it('is online within the first missed beat', () => {
    expect(workerLiveness('2026-09-12T11:59:30Z', now)).toBe('online')
  })

  it('warns once beats start going missing', () => {
    expect(workerLiveness('2026-09-12T11:58:30Z', now)).toBe('stale')
  })

  it('is offline at the TTL the control plane itself uses', () => {
    const atTtl = new Date(now.getTime() - HEARTBEAT_TTL_SECONDS * 1000).toISOString()
    expect(workerLiveness(atTtl, now)).toBe('offline')
  })

  it('is offline for an unparseable timestamp rather than assuming health', () => {
    expect(workerLiveness('not-a-date', now)).toBe('offline')
  })
})

describe('heartbeatAgeSeconds', () => {
  const now = new Date('2026-09-12T12:00:00Z')

  it('reports whole seconds since the last beat', () => {
    expect(heartbeatAgeSeconds('2026-09-12T11:59:15Z', now)).toBe(45)
  })

  it('clamps a worker clock running ahead to zero', () => {
    // Otherwise the UI reads "Heartbeat -3s ago".
    expect(heartbeatAgeSeconds('2026-09-12T12:00:03Z', now)).toBe(0)
  })

  it('is null when there is no beat', () => {
    expect(heartbeatAgeSeconds(null, now)).toBeNull()
  })
})

describe('isRelationLive', () => {
  it('needs the link armed and both accounts connected', () => {
    const master = account('a')
    const follower = account('b')
    expect(isRelationLive(relation('r', 'a', 'b'), master, follower)).toBe(true)
  })

  it('is false when the link is off', () => {
    expect(isRelationLive(relation('r', 'a', 'b', { isEnabled: false }), account('a'), account('b'))).toBe(false)
  })

  it('is false when an account is disconnected, even though the link says enabled', () => {
    // The dangerous middle state: the toggle reads on and nothing is copying.
    const follower = account('b', { connectionStatus: 'terminal_unavailable' })
    expect(isRelationLive(relation('r', 'a', 'b'), account('a'), follower)).toBe(false)
  })
})

describe('latencySummary', () => {
  it('reports the median, not the mean, so one outlier cannot hide the typical copy', () => {
    const events = [
      event({ e2eMs: 40 }), event({ e2eMs: 45 }), event({ e2eMs: 50 }), event({ e2eMs: 4000 }),
    ]
    const s = latencySummary(events)

    // Mean would be ~1034ms and imply a broken system; the typical copy was 47ms.
    expect(s.medianE2eMs).toBe(48)
    expect(s.worstE2eMs).toBe(4000)
    expect(s.samples).toBe(4)
  })

  it('ignores events with no timing rather than counting them as zero', () => {
    const s = latencySummary([event({ e2eMs: 100 }), event({ e2eMs: null })])
    expect(s.samples).toBe(1)
    expect(s.medianE2eMs).toBe(100)
  })

  it('computes success rate over settled attempts only', () => {
    const s = latencySummary([
      event({ status: 'success' }),
      event({ status: 'failed' }),
      event({ status: 'pending' }), // still in flight — not yet a pass or a fail
    ])
    expect(s.successRate).toBe(0.5)
  })

  it('returns nulls rather than NaN for an empty log', () => {
    const s = latencySummary([])
    expect(s.medianE2eMs).toBeNull()
    expect(s.worstE2eMs).toBeNull()
    expect(s.successRate).toBeNull()
    expect(s.samples).toBe(0)
  })

  it('surfaces switch cost, which is what reveals a shared terminal', () => {
    const s = latencySummary([event({ switchMs: 900 }), event({ switchMs: 1100 })])
    expect(s.medianSwitchMs).toBe(1000)
  })
})

function command(accountId: string, commandType: string): PendingCommand {
  return { id: `cmd-${accountId}-${commandType}`, accountId, commandType, createdAt: '2026-01-01T00:00:00Z' }
}

function worker(lastHeartbeatAt: string | null): WorkerNode {
  return {
    id: 'w1', name: 'eagle-win-01', region: 'home', host: 'PC',
    status: 'online', capacity: 5, activeSessions: 0, lastHeartbeatAt,
  }
}

describe('hasPendingTest', () => {
  it('is false when nothing is queued', () => {
    expect(hasPendingTest([], 'a')).toBe(false)
  })

  it('finds a queued test for that account', () => {
    expect(hasPendingTest([command('a', 'test_connection')], 'a')).toBe(true)
  })

  it('does not count another account\'s test', () => {
    expect(hasPendingTest([command('b', 'test_connection')], 'a')).toBe(false)
  })

  /* A pending flatten must not make the account read "Testing…" — they are
   * different commands and only one of them reports a connection verdict. */
  it('does not count a different command type on the same account', () => {
    expect(hasPendingTest([command('a', 'flatten')], 'a')).toBe(false)
  })
})

describe('anyWorkerLive', () => {
  const now = new Date('2026-01-01T12:00:00Z')

  it('is false with no workers at all', () => {
    expect(anyWorkerLive([], now)).toBe(false)
  })

  it('is false when every worker has gone cold', () => {
    expect(anyWorkerLive([worker('2026-01-01T11:00:00Z')], now)).toBe(false)
  })

  it('is true for a fresh heartbeat', () => {
    expect(anyWorkerLive([worker('2026-01-01T11:59:50Z')], now)).toBe(true)
  })

  /* A worker one missed beat behind is still polling. Telling someone their
   * command will never be answered when it will be a few seconds late is the
   * worse error, so `stale` counts as live. */
  it('counts a stale worker as live', () => {
    expect(anyWorkerLive([worker('2026-01-01T11:58:30Z')], now)).toBe(true)
  })

  it('is true when one of several workers is alive', () => {
    expect(anyWorkerLive([worker(null), worker('2026-01-01T11:59:55Z')], now)).toBe(true)
  })
})
