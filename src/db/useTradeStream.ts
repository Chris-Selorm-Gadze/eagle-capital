import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

/* Tell the app when its trades change underneath it.
 *
 * The worker journals closed trades from outside the browser, so before this a
 * trade landed in Postgres and sat there unseen until someone reloaded. The
 * dashboard is the page most likely to be open while that happens.
 *
 * A write triggers a refetch rather than being merged in place: `trades` feeds
 * the ledger, the equity curve and every aggregate, and reconstructing those
 * from a single changed row is a second implementation of code that already
 * exists. Refetching is one round trip and cannot drift from the real thing.
 *
 * Bursts are collapsed — the first sync of an account writes many rows at once,
 * and each would otherwise be its own refetch of the whole table.
 */
const SETTLE_MS = 400

export function useTradeStream(userId: string | null, onChanged: () => void) {
  const handler = useRef(onChanged)
  handler.current = onChanged

  useEffect(() => {
    if (!userId) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel('trades-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
        () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => handler.current(), SETTLE_MS)
        },
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [userId])
}
