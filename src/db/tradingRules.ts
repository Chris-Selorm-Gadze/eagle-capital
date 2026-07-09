import { supabase } from '../lib/supabaseClient'
import type { TradingRule } from '../types'

function fromRow(row: Record<string, any>): TradingRule {
  return {
    id: row.id,
    text: row.text,
    isCore: row.is_core ?? false,
  }
}

export async function listTradingRules(): Promise<TradingRule[]> {
  const { data, error } = await supabase.from('trading_rules').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addTradingRule(userId: string, rule: TradingRule): Promise<void> {
  const { error } = await supabase.from('trading_rules').insert({ user_id: userId, text: rule.text, is_core: rule.isCore ?? false })
  if (error) throw error
}

export async function updateTradingRule(id: string, patch: Partial<TradingRule>): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.text !== undefined) row.text = patch.text
  if (patch.isCore !== undefined) row.is_core = patch.isCore
  const { error } = await supabase.from('trading_rules').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteTradingRule(id: string): Promise<void> {
  const { error } = await supabase.from('trading_rules').delete().eq('id', id)
  if (error) throw error
}
