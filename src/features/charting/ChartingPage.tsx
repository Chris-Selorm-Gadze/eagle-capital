import { useEffect, useMemo, useRef, useState } from 'react'
import type { Trade } from '../../types'
import { TradingViewWidget } from './components/TradingViewWidget'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/shared/ui/page'
import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import styles from './ChartingPage.module.css'

const FALLBACK_SYMBOL = 'NASDAQ:AAPL'

/** Every symbol traded, most recently traded first — which is also the order
 * someone is most likely to want them in. */
function tradedSymbols(trades: Trade[]): string[] {
  const seen = new Set<string>()
  for (const t of [...trades].sort((a, b) => b.entryTime.localeCompare(a.entryTime))) {
    const symbol = t.symbol.toUpperCase()
    if (symbol) seen.add(symbol)
  }
  return [...seen]
}

export function ChartingPage({ trades }: { trades: Trade[] }) {
  const symbols = useMemo(() => tradedSymbols(trades), [trades])
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  /* The page used to chart whichever symbol you traded most recently, with no
   * control to change it — so a charting page could not be pointed at anything
   * you weren't already holding. The picker below is the whole fix; the default
   * is unchanged. */
  const [chosen, setChosen] = useState<string | null>(null)
  const symbol = chosen ?? symbols[0] ?? FALLBACK_SYMBOL

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
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          symbols.length > 0 ? (
            <Select onValueChange={setChosen} value={symbol}>
              <SelectTrigger aria-label="Symbol to chart" className="w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Only symbols actually traded. A free-text box would let you
                    ask for a ticker TradingView can't resolve and leave the
                    widget showing nothing with no explanation. */}
                {symbols.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
        description={
          symbols.length > 0
            ? 'Price action for the symbols you trade. Use TradingView’s own search inside the chart to go further afield.'
            : 'Nothing traded yet, so this is a sample symbol. Log a trade and your own symbols appear here.'
        }
        title="Charting"
      />

      <div className={styles.chartWrap} ref={chartWrapRef}>
        <Button
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className={styles.fullscreenButton}
          onClick={toggleFullscreen}
          size="icon-sm"
          variant="outline"
        >
          {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
        <TradingViewWidget symbol={symbol} />
      </div>
    </div>
  )
}
