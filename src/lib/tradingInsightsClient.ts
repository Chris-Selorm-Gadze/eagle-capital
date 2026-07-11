import { supabase } from './supabaseClient'
import type { InsightsPayload } from '../features/insights/buildInsightsPayload'

// Calls the trading-insights Supabase Edge Function — same auth pattern as
// economicCalendarClient.ts (session access_token as bearer). The Anthropic API key itself never
// reaches the browser; it's a Supabase Edge Function secret only.

export interface Finding {
  title: string
  description: string
  evidence: string
}

export interface InsightsResponse {
  summary: string
  painPoints: Finding[]
  strengths: Finding[]
  recommendations: Finding[]
}

export async function generateTradingInsights(payload: InsightsPayload): Promise<{ model: string; insights: InsightsResponse }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trading-insights`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Insights generation failed: ${res.status}`)
  return body
}
