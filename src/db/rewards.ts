import { supabase } from '../lib/supabaseClient'
import type { Reward } from '../types'

export function fromRow(row: Record<string, any>): Reward {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    growthPct: Number(row.growth_pct),
  }
}

export function toRow(r: Reward): Record<string, unknown> {
  return { account_id: r.accountId, date: r.date, growth_pct: r.growthPct }
}

export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase.from('rewards').select('*').order('date', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addReward(userId: string, accountId: string, date: string, growthPct: number): Promise<void> {
  const { error } = await supabase
    .from('rewards')
    .insert({ user_id: userId, ...toRow({ accountId, date, growthPct }) })
  if (error) throw error
}
