import { supabase } from '../lib/supabaseClient'
import { listTradingAccounts, type TradingAccount } from './copier'
import { selectAll } from './paginate'
import { mergeAccounts, type LiveAccountPositions } from './livePositions'

/* The live feed's transport.
 *
 * Two things were making the page slow that had nothing to do with the broker.
 *
 * It polled, so the browser's interval stacked on top of the worker's: a
 * position could be read, written, and still sit unseen for the rest of a
 * window. Postgres can push instead — the row arrives when it lands, and RLS
 * applies to the stream, so a subscriber sees only their own.
 *
 * And every tick refetched the account list: a full paginated read of
 * trading_accounts, every three seconds, for rows that change when someone
 * connects a broker. That list is fetched once here and reused, and only the
 * snapshots stream.
 *
 * The poll stays as a safety net at a much longer interval. A dropped
 * subscription is silent — without it the page would sit on stale numbers
 * looking live, which is the one failure this page must not have.
 */

const FALLBACK_POLL_MS = 15_000

export interface LiveFeedHandlers {
  onData: (accounts: LiveAccountPositions[]) => void
  onError: (err: unknown) => void
  /** Whether updates are arriving by push. False means the fallback poll is carrying it. */
  onStreamState?: (streaming: boolean) => void
}

type SnapshotRow = Record<string, unknown>

export interface LiveFeed {
  /** Force an immediate read — used on reconnect and when a tab becomes visible. */
  refresh: () => Promise<void>
  stop: () => void
}

export function subscribeLivePositions(handlers: LiveFeedHandlers): LiveFeed {
  let stopped = false
  let accounts: TradingAccount[] | null = null
  const snapshots = new Map<string, SnapshotRow>()
  let inFlight = false

  function emit() {
    if (stopped || accounts === null) return
    handlers.onData(mergeAccounts(accounts, [...snapshots.values()]))
  }

  async function loadAll() {
    if (inFlight) return
    inFlight = true
    try {
      // The account list is fetched once; after that only snapshots move.
      const [accountRows, snapshotRows] = await Promise.all([
        accounts === null ? listTradingAccounts() : Promise.resolve(accounts),
        selectAll<SnapshotRow>('live_positions', { orderBy: 'trading_account_id' }),
      ])
      if (stopped) return
      accounts = accountRows.filter((a) => a.isEnabled)
      snapshots.clear()
      for (const row of snapshotRows) {
        const id = row.trading_account_id
        if (typeof id === 'string') snapshots.set(id, row)
      }
      emit()
    } catch (err) {
      if (!stopped) handlers.onError(err)
    } finally {
      inFlight = false
    }
  }

  /* A pushed row is applied on its own rather than triggering a refetch: the
   * payload already carries every column, so re-reading the table would spend a
   * round trip to arrive at what is already in hand. */
  const channel = supabase
    .channel('live-positions')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_positions' },
      (payload) => {
        if (stopped) return
        const row = (payload.new ?? {}) as SnapshotRow
        const id = row.trading_account_id
        if (typeof id !== 'string') return
        if (payload.eventType === 'DELETE') snapshots.delete(id)
        else snapshots.set(id, row)
        emit()
      },
    )
    .subscribe((status) => {
      const streaming = status === 'SUBSCRIBED'
      handlers.onStreamState?.(streaming)
      // A resubscribe means time passed with the socket down, so the snapshots
      // in hand may have moved on. Read once rather than waiting for the next
      // write to reveal how far behind the page is.
      if (streaming) void loadAll()
    })

  void loadAll()

  const timer = setInterval(() => { void loadAll() }, FALLBACK_POLL_MS)

  return {
    refresh: loadAll,
    stop() {
      stopped = true
      clearInterval(timer)
      void supabase.removeChannel(channel)
    },
  }
}
