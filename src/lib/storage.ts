import { supabase } from './supabaseClient'

const PLAYBOOK_IMAGES_BUCKET = 'playbook-images'

/** Uploads a playbook example image to per-user-folder storage and returns its public URL. */
export async function uploadPlaybookImage(userId: string, file: File): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage.from(PLAYBOOK_IMAGES_BUCKET).upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from(PLAYBOOK_IMAGES_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
