import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

/* Tell a page when one of its tables changes underneath it.
 *
 * The worker writes trades, balances, connection status and copy events from
 * outside the browser. Before this, a page either missed them until someone
 * reloaded, or went looking on a timer whether or not anything had happened.
 *
 * A write triggers the page's own reload rather than being merged in place.
 * These rows feed ledgers and aggregates that already have one implementation,
 * and reconstructing those from a single changed row would be a second one.
 *
 * Two limits, because bursts are normal here rather than exceptional. `settleMs`
 * collapses a run of writes -- the first sync of an account writes many rows at
 * once, and each would otherwise be its own reload. `minIntervalMs` is the floor
 * between reloads while writes keep arriving: an active copy session writes an
 * execution event per fill, and a page that reloads seven tables on every one
 * would spend the session refetching.
 */
export interface TableStreamOptions {
  /** Quiet period after the last write before reloading. */
  settleMs?: number
  /** Floor between reloads while writes keep coming. */
  minIntervalMs?: number
  /** Skip subscribing entirely — for a page whose feature is off. */
  enabled?: boolean
}

export function useTableStream(
  table: string,
  userId: string | null,
  onChanged: () => void,
  { settleMs = 400, minIntervalMs = 2_000, enabled = true }: TableStreamOptions = {},
) {
  const handler = useRef(onChanged)
  handler.current = onChanged

  useEffect(() => {
    if (!userId || !enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let lastRun = 0
    let cancelled = false

    function schedule() {
      if (timer) clearTimeout(timer)
      const sinceLast = Date.now() - lastRun
      const wait = Math.max(settleMs, minIntervalMs - sinceLast)
      timer = setTimeout(() => {
        if (cancelled) return
        lastRun = Date.now()
        handler.current()
      }, wait)
    }

    const channel = supabase
      .channel(`${table}-stream`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        schedule,
      )
      .subscribe()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [table, userId, enabled, settleMs, minIntervalMs])
}
