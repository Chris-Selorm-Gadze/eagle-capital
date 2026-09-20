import { useEffect, useId, useRef } from 'react'
import { useResolvedTheme } from '@/hooks/use-theme'

interface TradingViewWidgetOptions {
  symbol: string
  interval: string
  timezone: string
  theme: 'dark' | 'light'
  style: string
  locale: string
  toolbar_bg: string
  enable_publishing: boolean
  allow_symbol_change: boolean
  container_id: string
  autosize: boolean
  withdateranges: boolean
  details: boolean
  hide_side_toolbar: boolean
  hide_top_toolbar: boolean
}

interface TradingViewWidgetInstance {
  remove?: () => void
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: TradingViewWidgetOptions) => TradingViewWidgetInstance
    }
  }
}

let tvScriptPromise: Promise<void> | null = null

function loadTradingViewScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve()
  if (!tvScriptPromise) {
    tvScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load TradingView script'))
      document.head.appendChild(script)
    })
  }
  return tvScriptPromise
}

/**
 * The full "Advanced Real-Time Chart" widget (tv.js) rather than the simplified
 * embed-widget-advanced-chart.js auto-embed — this is the same engine tradingview.com
 * itself runs, so it includes the full drawing-tool toolbar, native right-click chart
 * context menu (reset chart, remove drawings/indicators, settings), and its own
 * fullscreen control. Still an anonymous session — see the note on the page.
 */
export function TradingViewWidget({ symbol }: { symbol: string }) {
  // The widget is configured in JavaScript, not CSS, so it can't inherit the
  // theme — it has to be told. This was pinned to 'dark' with a matching dark
  // toolbar colour, which was right when the whole app was near-black and wrong
  // from the moment it went light: a black chart in a white page. It follows the
  // app now, in both directions.
  const theme = useResolvedTheme()
  const rawId = useId()
  const containerId = `tv-widget-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<TradingViewWidgetInstance | null>(null)

  useEffect(() => {
    let cancelled = false

    loadTradingViewScript().then(() => {
      if (cancelled || !window.TradingView || !containerRef.current) return
      widgetRef.current = new window.TradingView.widget({
        symbol,
        interval: 'D',
        timezone: 'Etc/UTC',
        theme,
        style: '1',
        locale: 'en',
        toolbar_bg: theme === 'dark' ? '#1a1a19' : '#ffffff',
        enable_publishing: false,
        allow_symbol_change: true,
        container_id: containerId,
        autosize: true,
        withdateranges: true,
        details: true,
        hide_side_toolbar: false,
        hide_top_toolbar: false,
      })
    })

    return () => {
      cancelled = true
      try {
        widgetRef.current?.remove?.()
      } catch {
        // TradingView's widget can throw here if React has already torn down the container
        // div (e.g. switching away from this tab) before the widget's own internal cleanup
        // runs — a third-party library's teardown error must never crash the whole app.
      }
      widgetRef.current = null
    }
  }, [symbol, containerId, theme])

  return <div id={containerId} ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
