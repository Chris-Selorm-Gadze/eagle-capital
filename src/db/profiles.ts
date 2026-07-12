import { supabase } from '../lib/supabaseClient'

export interface Profile {
  userId: string
  username: string
}

function fromRow(row: { user_id: string; username: string }): Profile {
  return { userId: row.user_id, username: row.username }
}

function sanitizeUsername(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
  return cleaned || 'trader'
}

async function isUsernameTaken(username: string, excludingUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('eaglecapital_profiles')
    .select('user_id')
    .eq('username', username)
    .neq('user_id', excludingUserId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('eaglecapital_profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

/** Fetches the signed-in user's profile, auto-generating one from their email's local part
 * (chris@x.com -> "chris") on first login. Collisions resolve by appending an incrementing
 * number — the unique constraint on `username` is the real source of truth (handles two tabs
 * racing to provision at once); this just picks a cheap starting point before hitting it. */
export async function ensureProfile(userId: string, email: string | undefined | null): Promise<Profile> {
  const existing = await getProfile(userId)
  if (existing) return existing

  const base = sanitizeUsername(email?.split('@')[0] ?? 'trader')
  let attempt = 0
  for (;;) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`
    const { data, error } = await supabase
      .from('eaglecapital_profiles')
      .insert({ user_id: userId, username: candidate })
      .select('*')
      .single()
    if (!error) return fromRow(data)
    if (error.code !== '23505') throw error
    attempt += 1
    if (attempt > 50) throw new Error('Could not generate a unique username')
  }
}

export async function updateUsername(userId: string, rawUsername: string): Promise<Profile> {
  const username = sanitizeUsername(rawUsername)
  const taken = await isUsernameTaken(username, userId)
  if (taken) throw new Error(`"${username}" is already taken — try another.`)

  const { data, error } = await supabase
    .from('eaglecapital_profiles')
    .update({ username })
    .eq('user_id', userId)
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`"${username}" is already taken — try another.`)
    throw error
  }
  return fromRow(data)
}
