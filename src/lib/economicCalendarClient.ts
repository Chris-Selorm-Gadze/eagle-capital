import { supabase } from './supabaseClient'

// Fetches the free ForexFactory economic-calendar feed (US + other majors, current week) via a
// Supabase Edge Function (supabase/functions/economic-calendar). The feed itself has no CORS
// headers and 429s non-browser User-Agents, so the browser can't call nfs.faireconomy.media
// directly — the Edge Function proxies and caches it server-side.
//
// Limitation inherent to this feed (not the proxy): it never carries the actual printed value,
// only forecast/previous — confirmed by hand, there's no paid-free alternative that includes it.

export interface EconomicEvent {
  title: string
  country: string // currency code, e.g. 'USD', 'EUR' — not a literal country name
  date: string // ISO datetime with offset
  impact: string // 'High' | 'Medium' | 'Low' | 'Holiday', observed values — feed doesn't publish a strict enum
  forecast: string
  previous: string
}

export async function fetchEconomicCalendar(): Promise<EconomicEvent[]> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/economic-calendar`
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Economic calendar fetch failed: ${res.status}`)
  return res.json()
}
