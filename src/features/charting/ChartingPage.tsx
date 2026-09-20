import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trade } from '../../types'
import { TradingViewWidget } from './components/TradingViewWidget'
import styles from './ChartingPage.module.css'

const FALLBACK_SYMBOL = 'NASDAQ:AAPL'

function defaultSymbol(trades: Trade[]): string {
  const mostRecent = [...trades].sort((a, b) => b.entryTime.localeCompare(a.entryTime))[0]
  return mostRecent?.symbol.toUpperCase() || FALLBACK_SYMBOL
}

export function ChartingPage({ trades }: { trades: Trade[] }) {
  const symbol = useMemo(() => defaultSymbol(trades), [trades])
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(document.fullscreenElement === chartWrapRef.current)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  function toggleFullscreen() {
    // Both reject rather than throw when the browser refuses — an iframe
    // without the permission, or a user gesture the browser did not accept.
    // Unhandled, that surfaces as a console error and a Sentry event for
    // something the page can simply carry on without.
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : chartWrapRef.current?.requestFullscreen()
    void request?.catch(() => {})
  }

  return (
    <div className={styles.chartWrap} ref={chartWrapRef}>
      <button onClick={toggleFullscreen} className={`btn-ghost ${styles.fullscreenButton}`}>
        {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      </button>
      <TradingViewWidget symbol={symbol} />
    </div>
  )
}
