import { useEffect, useMemo, useState } from 'react'
import { describeLoadFailure, type LiveAccountPositions } from '../../db/livePositions'
import { subscribeLivePositions } from '../../db/livePositionsStream'

/** One live feed, shared by the Live Trading page and the dashboard's strip.
 *
 * Both want the same rows off the same subscription; two copies would open two
 * channels and let the two surfaces disagree about what is open right now. */
export interface LiveFeedState {
  accounts: LiveAccountPositions[] | null
  error: string | null
  streaming: boolean
  totals: { accounts: number; open: number; unrealized: number; equity: number }
}

export function useLivePositions(enabled = true): LiveFeedState {
  const [accounts, setAccounts] = useState<LiveAccountPositions[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const feed = subscribeLivePositions({
      onData: (rows) => { setAccounts(rows); setError(null) },
      onError: (err) => {
        const failure = describeLoadFailure(err)
        setError(failure.message)
        if (failure.fatal) feed.stop()
      },
      onStreamState: setStreaming,
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void feed.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      feed.stop()
    }
  }, [enabled])

  const totals = useMemo(() => {
    const rows = accounts ?? []
    const open = rows.flatMap((a) => a.positions)
    return {
      accounts: rows.length,
      open: open.length,
      unrealized: open.reduce((sum, p) => sum + p.unrealizedPnl, 0),
      equity: rows.reduce((sum, a) => sum + (a.equity ?? 0), 0),
    }
  }, [accounts])

  return { accounts, error, streaming, totals }
}
