import { useCallback, useEffect, useState } from 'react'
import type { Account, SessionLog, Payout, Reward, Trade } from '../types'
import { listAccounts } from './accounts'
import { listSessions } from './sessions'
import { listPayouts } from './payouts'
import { listRewards } from './rewards'
import { listTrades } from './trades'

export interface SupabaseData {
  accounts: Account[]
  sessions: SessionLog[]
  payouts: Payout[]
  rewards: Reward[]
  trades: Trade[]
  loading: boolean
  refresh: () => Promise<void>
}

/** Loads all of a signed-in user's prop-firm data from Supabase (RLS-scoped) and re-fetches
 * on demand after writes — there's no Dexie-style live reactivity anymore, so every mutation
 * needs to call `refresh()` afterward for the UI to pick it up. */
export function useSupabaseData(userId: string | undefined): SupabaseData {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [rewards, setRewards] = useState<Reward[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) return
    const [a, s, p, r, t] = await Promise.all([listAccounts(), listSessions(), listPayouts(), listRewards(), listTrades()])
    setAccounts(a)
    setSessions(s)
    setPayouts(p)
    setRewards(r)
    setTrades(t)
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setAccounts([])
      setSessions([])
      setPayouts([])
      setRewards([])
      setTrades([])
      setLoading(false)
      return
    }
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [userId, refresh])

  return { accounts, sessions, payouts, rewards, trades, loading, refresh }
}
