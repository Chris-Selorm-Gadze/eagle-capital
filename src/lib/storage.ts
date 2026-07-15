import { supabase } from './supabaseClient'

const PLAYBOOK_IMAGES_BUCKET = 'playbook-images'

// Supabase Storage rejects object keys containing characters outside a conservative safe set —
// raw filenames like "Screenshot 2026-07-14 at 8.11.27 PM.png" (spaces, colons from OS screenshot
// naming) fail upload with "Invalid key". Strip to a safe subset instead of passing file.name
// through untouched; the random UUID prefix already guarantees uniqueness so collisions aren't a
// concern here.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '-')
}

async function uploadToBucket(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/** Uploads a playbook example image to per-user-folder storage and returns its public URL. */
export async function uploadPlaybookImage(userId: string, file: File): Promise<string> {
  return uploadToBucket(PLAYBOOK_IMAGES_BUCKET, `${userId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`, file)
}

/** Uploads a report card trade screenshot to the same per-user-folder bucket, returns its public URL. */
export async function uploadReportCardImage(userId: string, file: File): Promise<string> {
  return uploadToBucket(PLAYBOOK_IMAGES_BUCKET, `${userId}/report-cards/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`, file)
}
