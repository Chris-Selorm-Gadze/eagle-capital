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

/** Turns a public Storage URL back into the object key inside the bucket.
 *
 * Needed because the app stores full public URLs on the row (so `<img src>`
 * works with no plumbing) but Storage's remove() takes bucket-relative paths.
 * Returns null for anything that isn't a URL into this bucket, so a malformed
 * or foreign value can never be used to address someone else's object. */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PLAYBOOK_IMAGES_BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = decodeURIComponent(url.slice(at + marker.length))
  return path.length > 0 ? path : null
}

/** Removes uploaded images once the row referencing them is gone.
 *
 * Nothing in the app used to delete a Storage object, ever — deleting a
 * playbook, an example, or an entire account left every screenshot sitting in a
 * public bucket at a URL that still resolved. Storage RLS restricts writes to
 * the owner's own folder, so this can only ever remove the caller's files.
 *
 * Failures are swallowed deliberately: the row is already gone and the user's
 * action has succeeded from their point of view. An orphaned object is cleaned
 * up by the purge job at worst. */
export async function deleteImagesByUrl(urls: (string | null | undefined)[]): Promise<void> {
  const paths = urls
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map(pathFromPublicUrl)
    .filter((p): p is string => p !== null)
  if (paths.length === 0) return
  try {
    await supabase.storage.from(PLAYBOOK_IMAGES_BUCKET).remove(paths)
  } catch {
    /* see above */
  }
}
