import { supabase } from '../lib/supabaseClient'
import type { Playbook } from '../types'

function fromRow(row: Record<string, any>): Playbook {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    grade: row.grade ?? undefined,
  }
}

function toRow(p: Partial<Playbook>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (p.name !== undefined) row.name = p.name
  if (p.description !== undefined) row.description = p.description
  if (p.grade !== undefined) row.grade = p.grade
  return row
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const { data, error } = await supabase.from('playbooks').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addPlaybook(userId: string, input: Playbook): Promise<string> {
  const { data, error } = await supabase
    .from('playbooks')
    .insert({ user_id: userId, ...toRow(input) })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updatePlaybook(id: string, patch: Partial<Playbook>): Promise<void> {
  const { error } = await supabase.from('playbooks').update(toRow(patch)).eq('id', id)
  if (error) throw error
}

export async function deletePlaybook(id: string): Promise<void> {
  const { error } = await supabase.from('playbooks').delete().eq('id', id)
  if (error) throw error
}
