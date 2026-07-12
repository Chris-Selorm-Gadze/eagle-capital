import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, createSeriesMarkers, LineStyle, TickMarkType, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import type { Trade } from '../../../../types'
import { fetchIntradayCandles, fetchDailyCandles, fmpConfigured, type Candle, type IntradayInterval } from '../../../../lib/fmpClient'
import { getFmpSymbol } from '../../symbolAliasMap'
import { utcMsToZonedDateStr } from '../../../../utils/timezone'
import styles from '../TradeDetailPanel.module.css'

// lightweight-charts renders its time axis/crosshair in UTC by default (all our candle times
// are UTCTimestamp seconds) — everywhere else in the app (Stats tab, this tab's own diagnostic
// caption) shows the browser's local time via toLocaleString(), so left alone the chart axis and
// the rest of the UI would disagree by exactly the viewer's UTC offset, looking like a data bug
// when it's really just two different display timezones for the same correct instant.
function formatTickMark(time: number, tickMarkType: TickMarkType): string {
  const date = new Date(time * 1000)
  switch (tickMarkType) {
    case TickMarkType.Year: return date.toLocaleDateString(undefined, { year: 'numeric' })
    case TickMarkType.Month: return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    case TickMarkType.DayOfMonth: return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    case TickMarkType.TimeWithSeconds: return date.toLocaleTimeString()
    default: return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
}

// Free-tier FMP intervals only (15min/30min/4hour are premium-gated, confirmed by hand) —
// picks a bar size and lookback window that keeps the trade's own hold time readable without
// drowning it in either a handful of daily bars or thousands of 1-minute ones.
function pickIntervalAndPadding(durationMinutes: number): { interval: IntradayInterval | 'daily'; paddingMs: number } {
  if (durationMinutes <= 30) return { interval: '1min', paddingMs: 20 * 60_000 }
  if (durationMinutes <= 4 * 60) return { interval: '5min', paddingMs: 45 * 60_000 }
  if (durationMinutes <= 3 * 24 * 60) return { interval: '1hour', paddingMs: 6 * 60 * 60_000 }
  return { interval: 'daily', paddingMs: 2 * 24 * 60 * 60_000 }
}

export function TradeChartTab({ trade }: { trade: Trade }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [barInterval, setBarInterval] = useState<IntradayInterval | 'daily' | null>(null)
  const [outOfRange, setOutOfRange] = useState(false)

  const fmpSymbol = getFmpSymbol(trade.symbol)

  useEffect(() => {
    if (!fmpConfigured) {
      setLoading(false)
      setCandles(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setCandles(null)
    setOutOfRange(false)

    const entryMs = new Date(trade.entryTime).getTime()
    const exitMs = new Date(trade.exitTime).getTime()
    const { interval, paddingMs } = pickIntervalAndPadding((exitMs - entryMs) / 60_000)
    setBarInterval(interval)
    const fromStr = utcMsToZonedDateStr(entryMs - paddingMs, 'America/New_York')
    const toStr = utcMsToZonedDateStr(exitMs + paddingMs, 'America/New_York')

    const load = interval === 'daily'
      ? fetchDailyCandles(fmpSymbol, fromStr, toStr)
      : fetchIntradayCandles(fmpSymbol, interval, fromStr, toStr)

    load.then((data) => {
      if (cancelled) return
      // Sanity check: if the trade's own entry/exit instant falls outside the fetched candle
      // span entirely, any marker the library renders for it is meaningless (likely clamped to
      // the nearest edge bar) — surface that plainly instead of silently showing a misleading chart.
      if (data.length > 0) {
        const entrySec = Math.floor(entryMs / 1000)
        const exitSec = Math.floor(exitMs / 1000)
        const first = data[0].time
        const last = data[data.length - 1].time
        if (entrySec < first || entrySec > last || exitSec < first || exitSec > last) {
          setOutOfRange(true)
        }
      }
      setCandles(data)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [trade.id, trade.entryTime, trade.exitTime, fmpSymbol])

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#c3c2b7' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number, tickMarkType: TickMarkType) => formatTickMark(time, tickMarkType),
      },
      localization: {
        timeFormatter: (time: number) => new Date(time * 1000).toLocaleString(),
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
    })
    chartRef.current = chart

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0ca30c', downColor: '#d03b3b', borderVisible: false,
      wickUpColor: '#0ca30c', wickDownColor: '#d03b3b',
    })
    series.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })))

    // Both markers use the SAME position rule ('aboveBar') rather than the newer atPriceMiddle
    // mode (didn't resolve correctly — markers rendered stacked at a fixed spot) or a rule tied
    // to trade direction (e.g. belowBar for long-entry/aboveBar for long-exit) — a direction-based
    // rule creates a fixed cosmetic vertical offset between entry and exit that has nothing to do
    // with real price movement, so a short that *lost* (price rose) could still render with the
    // exit arrow below the entry arrow purely from the cosmetic offset, falsely reading as a win.
    // With an identical rule for both, any real vertical difference between them reflects only
    // the actual candle prices at those two bars.
    const isLong = trade.side === 'long'
    createSeriesMarkers(series, [
      {
        time: Math.floor(new Date(trade.entryTime).getTime() / 1000) as UTCTimestamp,
        position: 'aboveBar',
        shape: isLong ? 'arrowUp' : 'arrowDown', color: '#3987e5', text: 'Entry',
      },
      {
        time: Math.floor(new Date(trade.exitTime).getTime() / 1000) as UTCTimestamp,
        position: 'aboveBar',
        shape: isLong ? 'arrowDown' : 'arrowUp', color: trade.pnl >= 0 ? '#0ca30c' : '#d03b3b', text: 'Exit',
      },
    ])

    if (trade.stopLoss !== undefined) {
      series.createPriceLine({ price: trade.stopLoss, color: '#d03b3b', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Stop' })
    }
    if (trade.profitTarget !== undefined) {
      series.createPriceLine({ price: trade.profitTarget, color: '#0ca30c', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Target' })
    }

    chart.timeScale().fitContent()

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [candles, trade])

  if (!fmpConfigured) {
    return <p className={styles.hint}>Set VITE_FMP_API_KEY in .env.local to enable the price chart.</p>
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading chart…</p>
  }

  if (!candles || candles.length === 0) {
    return <p className={styles.hint}>Chart not available for this trade.</p>
  }

  return (
    <div>
      <p className={styles.hint} style={{ marginBottom: '0.5rem' }}>
        Plotting <strong>{fmpSymbol}</strong> ({barInterval} bars) · Entry {new Date(trade.entryTime).toLocaleString()} @ {trade.entryPrice}
        {' '}· Exit {new Date(trade.exitTime).toLocaleString()} @ {trade.exitPrice} — compare against the Stats tab for this same trade.
      </p>
      {outOfRange && (
        <p style={{ color: 'var(--critical)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
          Warning: this trade's entry/exit time falls outside the candle data actually returned —
          the markers below are likely misaligned. This can happen if {fmpSymbol} has no data that
          far back on FMP's free tier, or if the trade's stored time is off.
        </p>
      )}
      <div ref={containerRef} style={{ height: '640px', width: '100%' }} />
    </div>
  )
}
