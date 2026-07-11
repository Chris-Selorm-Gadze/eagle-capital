import { supabase } from '../lib/supabaseClient'
import type { InsightsPayload, InsightsRangePreset } from '../features/insights/buildInsightsPayload'
import type { InsightsResponse } from '../lib/tradingInsightsClient'

export interface AiInsight {
  id?: string
  createdAt?: string
  rangeStart: string
  rangeEnd: string
  rangePreset: InsightsRangePreset
  tradeCount: number
  reportCardCount: number
  model: string
  response: InsightsResponse
  requestPayload?: InsightsPayload
}

function fromRow(row: Record<string, any>): AiInsight {
  return {
    id: row.id,
    createdAt: row.created_at,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    rangePreset: row.range_preset,
    tradeCount: row.trade_count,
    reportCardCount: row.report_card_count,
    model: row.model,
    response: row.response,
    requestPayload: row.request_payload ?? undefined,
  }
}

function toRow(i: AiInsight): Record<string, unknown> {
  return {
    range_start: i.rangeStart,
    range_end: i.rangeEnd,
    range_preset: i.rangePreset,
    trade_count: i.tradeCount,
    report_card_count: i.reportCardCount,
    model: i.model,
    response: i.response,
    request_payload: i.requestPayload ?? null,
  }
}

/** Persists a generated digest — insights are immutable snapshots, never edited after generation. */
export async function saveAiInsight(userId: string, insight: AiInsight): Promise<string> {
  const { data, error } = await supabase
    .from('ai_insights')
    .insert({ user_id: userId, ...toRow(insight) })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Every saved digest for the signed-in user, most recent first. */
export async function listAiInsights(): Promise<AiInsight[]> {
  const { data, error } = await supabase
    .from('ai_insights')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function deleteAiInsight(id: string): Promise<void> {
  const { error } = await supabase.from('ai_insights').delete().eq('id', id)
  if (error) throw error
}
