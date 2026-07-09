import { supabase } from '../lib/supabaseClient'
import type { PlaybookExample } from '../types'

function fromRow(row: Record<string, any>): PlaybookExample {
  return {
    id: row.id,
    playbookId: row.playbook_id,
    tradeId: row.trade_id ?? undefined,
    note: row.note ?? undefined,
    imageUrl: row.image_url ?? undefined,
  }
}

function toRow(e: PlaybookExample): Record<string, unknown> {
  return {
    playbook_id: e.playbookId,
    trade_id: e.tradeId ?? null,
    note: e.note,
    image_url: e.imageUrl,
  }
}

export async function listPlaybookExamples(): Promise<PlaybookExample[]> {
  const { data, error } = await supabase.from('playbook_examples').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addPlaybookExample(userId: string, input: PlaybookExample): Promise<void> {
  const { error } = await supabase.from('playbook_examples').insert({ user_id: userId, ...toRow(input) })
  if (error) throw error
}

export async function deletePlaybookExample(id: string): Promise<void> {
  const { error } = await supabase.from('playbook_examples').delete().eq('id', id)
  if (error) throw error
}
