import { zonedNaiveToUtcMs } from '../utils/timezone'

// Financial Modeling Prep — free-tier intraday/daily candle data for the Trade Chart tab.
// CORS is wide open on their API (unlike the ForexFactory feed), so this calls FMP directly
// from the browser — no proxy needed.
//
// FMP gates many symbols/intervals to paid plans, confirmed by hand: 1min/5min/1hour and daily
// EOD are free, but 15min/30min/4hour are not; forex majors and crypto majors are free, but
// broker-style index/metal tickers (US100, NAS100, XAUUSD, SPX, ...) are premium-only — the
// index tickers that ARE free use Yahoo-style carets (^DJI, ^GSPC, ^IXIC, ^RUT, ^VIX). Gated
// responses come back as plain, non-JSON text ("Premium Query Parameter: ...") rather than an
// error object, so this treats any fetch that isn't valid JSON as "no data available."

const BASE = 'https://financialmodelingprep.com/stable'
const KEY = import.meta.env.VITE_FMP_API_KEY

export const fmpConfigured = Boolean(KEY)

export interface Candle {
  time: number // UTC seconds
  open: number
  high: number
  low: number
  close: number
}

export type IntradayInterval = '1min' | '5min' | '1hour'

interface RawBar {
  date: string
  open: number
  high: number
  low: number
  close: number
}

async function fetchBars(path: string, params: Record<string, string>): Promise<RawBar[]> {
  const qs = new URLSearchParams({ ...params, apikey: KEY ?? '' })
  const res = await fetch(`${BASE}/${path}?${qs.toString()}`)
  const text = await res.text()
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // gated/unknown symbol — FMP returns a plain-text message, not JSON
  }
}

/** Intraday candles for `symbol` between two 'YYYY-MM-DD' dates, oldest first. */
export async function fetchIntradayCandles(
  symbol: string,
  interval: IntradayInterval,
  fromDate: string,
  toDate: string,
): Promise<Candle[]> {
  const bars = await fetchBars(`historical-chart/${interval}`, { symbol, from: fromDate, to: toDate })
  return bars
    .map((b) => ({ time: Math.floor(zonedNaiveToUtcMs(b.date, 'America/New_York') / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
    .sort((a, b) => a.time - b.time)
}

/** Daily candles for `symbol` between two 'YYYY-MM-DD' dates, oldest first. */
export async function fetchDailyCandles(symbol: string, fromDate: string, toDate: string): Promise<Candle[]> {
  const bars = await fetchBars('historical-price-eod/full', { symbol, from: fromDate, to: toDate })
  return bars
    .map((b) => ({ time: Math.floor(Date.parse(`${b.date}T00:00:00Z`) / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
    .sort((a, b) => a.time - b.time)
}
