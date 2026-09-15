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

  // Guards against a slow first load resolving after a later one and overwriting
  // fresher data — and against setting state on an unmounted component.
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) return
    const id = ++requestId.current
    try {
      const [a, s, p, r, t] = await Promise.all([
        listAccounts(), listSessions(), listPayouts(), listRewards(), listTrades(),
      ])
      if (id !== requestId.current) return
      setAccounts(a)
      setSessions(s)
      setPayouts(p)
      setRewards(r)
      setTrades(t)
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
      setError(errorMessage(err))
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      requestId.current++
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

  return { accounts, sessions, payouts, rewards, trades, loading, error, refresh }
}
