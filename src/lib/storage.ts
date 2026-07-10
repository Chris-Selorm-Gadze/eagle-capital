import { supabase } from './supabaseClient'

const PLAYBOOK_IMAGES_BUCKET = 'playbook-images'

async function uploadToBucket(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** Uploads a playbook example image to per-user-folder storage and returns its public URL. */
export async function uploadPlaybookImage(userId: string, file: File): Promise<string> {
  return uploadToBucket(PLAYBOOK_IMAGES_BUCKET, `${userId}/${crypto.randomUUID()}-${file.name}`, file)
}

/** Uploads a report card trade screenshot to the same per-user-folder bucket, returns its public URL. */
export async function uploadReportCardImage(userId: string, file: File): Promise<string> {
  return uploadToBucket(PLAYBOOK_IMAGES_BUCKET, `${userId}/report-cards/${crypto.randomUUID()}-${file.name}`, file)
}
