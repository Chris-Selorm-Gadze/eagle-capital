import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account, SessionLog, Payout, Reward, Trade } from '../types'
import { listAccounts } from './accounts'
import { listSessions } from './sessions'
import { listPayouts } from './payouts'
import { listRewards } from './rewards'
import { listTrades } from './trades'
import { errorMessage } from '../utils/errors'

export interface SupabaseData {
  accounts: Account[]
  sessions: SessionLog[]
  payouts: Payout[]
  rewards: Reward[]
  trades: Trade[]
  loading: boolean
  /** Non-null when the last load failed. The UI must show this instead of an
   * empty state — see the note on `refresh` below. */
  error: string | null
  refresh: () => Promise<void>
  /** Re-reads trades alone. The worker journals them continuously, and pulling
   * accounts, sessions, payouts and rewards down again every time one lands is
   * four table reads that cannot have changed. */
  refreshTrades: () => Promise<void>
}

/** Loads all of a signed-in user's data from Supabase (RLS-scoped) and re-fetches on
 * demand after writes — there's no Dexie-style live reactivity anymore, so every mutation
 * needs to call `refresh()` afterward for the UI to pick it up.
 *
 * This used to be `refresh().finally(() => setLoading(false))` with no catch: a dropped
 * connection or a policy error resolved loading, left every array empty, and rendered the
 * new-user onboarding panel — telling someone whose data had merely failed to load that
 * their desk was empty. Failures are now surfaced, and `refresh` never rejects into an
 * unhandled promise. */
export function useSupabaseData(userId: string | undefined): SupabaseData {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Guard against a slow load resolving after a later one and overwriting
  // fresher data — and against setting state on an unmounted component.
  //
  // Two counters, not one. They used to share a single counter, so a trade
  // arriving from the worker in the middle of a full reload bumped it and the
  // reload's accounts, sessions, payouts and rewards were thrown away whole —
  // a dashboard account created from the Trade Copier then did not appear
  // until the next full reload, and neither did its trades' P&L on the tiles.
  // Every read of `trades` bumps `tradesRequest`; only a full reload bumps
  // `fullRequest`. Each result is applied if nothing newer of its own kind has
  // started, so the trade list is always the newest and the rest never lost.
  const fullRequest = useRef(0)
  const tradesRequest = useRef(0)
  // Which kind of read the current error came from. A trades-only read that
  // succeeds must not clear a failed full reload's error: that would swap the
  // error panel for a dashboard with no accounts on it.
  const errorFrom = useRef<'full' | 'trades' | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) return
    const id = ++fullRequest.current
    const tid = ++tradesRequest.current
    try {
      const [a, s, p, r, t] = await Promise.all([
        listAccounts(), listSessions(), listPayouts(), listRewards(), listTrades(),
      ])
      if (id !== fullRequest.current) return
      setAccounts(a)
      setSessions(s)
      setPayouts(p)
      setRewards(r)
      if (tid === tradesRequest.current) setTrades(t)
      errorFrom.current = null
      setError(null)
    } catch (err) {
      if (id !== fullRequest.current) return
      errorFrom.current = 'full'
      setError(errorMessage(err))
    }
  }, [userId])

  /* Trades only. A full reload that started earlier still applies everything
   * else it read; only its (older) trade list is dropped in favour of this. */
  const refreshTrades = useCallback(async () => {
    if (!userId) return
    const tid = ++tradesRequest.current
    try {
      const t = await listTrades()
      if (tid !== tradesRequest.current) return
      setTrades(t)
      if (errorFrom.current === 'trades') {
        errorFrom.current = null
        setError(null)
      }
    } catch (err) {
      if (tid !== tradesRequest.current) return
      if (errorFrom.current !== 'full') errorFrom.current = 'trades'
      setError(errorMessage(err))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      fullRequest.current++
      tradesRequest.current++
      errorFrom.current = null
      setAccounts([])
      setSessions([])
      setPayouts([])
      setRewards([])
      setTrades([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [userId, refresh])

  return { accounts, sessions, payouts, rewards, trades, loading, error, refresh, refreshTrades }
}
