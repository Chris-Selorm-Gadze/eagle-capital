/** Extracts a human-readable message from any thrown value — including Supabase's
 * PostgrestError/AuthError, which are plain objects with a `message` field, not real
 * Error instances, so `err instanceof Error` misses them and `String(err)` just gives
 * "[object Object]". */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}
