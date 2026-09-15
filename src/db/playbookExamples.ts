import { supabase } from '../lib/supabaseClient'
import { selectAll } from './paginate'
import { deleteImagesByUrl } from '../lib/storage'
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
  return (await selectAll('playbook_examples', { orderBy: 'created_at' })).map(fromRow)
}

export async function addPlaybookExample(userId: string, input: PlaybookExample): Promise<void> {
  const { error } = await supabase.from('playbook_examples').insert({ user_id: userId, ...toRow(input) })
  if (error) throw error
}

/** Deletes the row AND its uploaded screenshot. Deleting the row alone used to
 * leave the image in a public bucket at a URL that still resolved, with nothing
 * left pointing at it — so it could never be found again, let alone removed. */
export async function deletePlaybookExample(id: string): Promise<void> {
  const { data: existing } = await supabase
    .from('playbook_examples')
    .select('image_url')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('playbook_examples').delete().eq('id', id)
  if (error) throw error

  // After the row is gone: if this fails the user's action still succeeded, and
  // the orphan is swept up by the purge job.
  await deleteImagesByUrl([existing?.image_url])
}
