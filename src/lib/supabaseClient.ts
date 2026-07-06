import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing — set VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in .env.local. Auth/broker-sync features are disabled until then.')
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-anon-key')
