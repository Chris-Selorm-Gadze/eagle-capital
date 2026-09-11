import { supabase } from '../lib/supabaseClient'

/* Whole-account data operations: export and erasure.
 *
 * The marketing site promises both — the pricing FAQ says "Can I export and
 * leave? Yes. Your data is yours." — so they live here rather than being
 * scattered across the feature pages that happen to own each table. */

/** Every table holding user rows, child-first.
 *
 * Order matters for deletion: `playbook_examples` references `playbooks` and
 * `broker_connection_accounts` references `broker_connections`, so children are
 * removed before parents. If the schema ever gains ON DELETE CASCADE this stays
 * correct, just redundant. */
const USER_TABLES = [
  'playbook_examples',
  'broker_connection_accounts',
  'trades',
  'sessions',
  'payouts',
  'rewards',
  'report_cards',
  'trading_rules',
  'ai_insights',
  'playbooks',
  'broker_connections',
  'accounts',
] as const

export type UserTable = (typeof USER_TABLES)[number]

export interface ExportBundle {
  exportedAt: string
  /** Rows keyed by table name. Empty tables are still present, so the shape of
   * the export doesn't change depending on what the user happens to have. */
  tables: Record<string, unknown[]>
}

/** Reads every user-owned table. RLS already scopes each query to auth.uid(),
 * so there's no user filter here — the same reason the rest of src/db doesn't
 * pass one either. */
export async function exportAllData(): Promise<ExportBundle> {
  const tables: Record<string, unknown[]> = {}
  for (const table of USER_TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) throw error
    tables[table] = data ?? []
  }
  const { data: profile } = await supabase.from('eaglecapital_profiles').select('*')
  tables.profile = profile ?? []
  return { exportedAt: new Date().toISOString(), tables }
}

/** Flattens the trades table to CSV — the format people actually re-import into
 * a spreadsheet. The JSON export is the complete one; this is the convenient one. */
export function tradesToCsv(trades: Record<string, unknown>[]): string {
  if (trades.length === 0) return ''
  const columns = [...new Set(trades.flatMap((t) => Object.keys(t)))]
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    // Quote anything containing a delimiter, quote or newline; double inner quotes.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = trades.map((t) => columns.map((c) => escape(t[c])).join(','))
  return [columns.join(','), ...rows].join('\n')
}

/** Triggers a browser download of `content` without touching the network. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Deletes every row this user owns.
 *
 * Note this does NOT delete the auth user itself — removing an entry from
 * auth.users requires the service-role key, which must never reach the browser.
 * The caller signs the user out afterwards; reclaiming the auth row is a
 * server-side job (an Edge Function using the admin client). Until that exists,
 * a "deleted" account is one with no data left and no way back into anything. */
export async function deleteAllUserData(userId: string): Promise<void> {
  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw error
  }
  const { error } = await supabase.from('eaglecapital_profiles').delete().eq('user_id', userId)
  if (error) throw error
}
