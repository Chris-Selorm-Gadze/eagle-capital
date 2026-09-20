import { supabase } from '../lib/supabaseClient'
import { selectAll } from './paginate'

/* Whole-account data operations: export and erasure.
 *
 * The marketing site promises both — the pricing FAQ says "Can I export and
 * leave? Yes. Your data is yours." — so they live here rather than being
 * scattered across the feature pages that happen to own each table. */

/** Every table holding user rows. Ordered child-first so the same list can be
 * reused by the purge job, where deleting a parent before its children would
 * fail on any FK that isn't ON DELETE CASCADE. */
const USER_TABLES = [
  'playbook_examples',
  'broker_connection_accounts',
  // `copier_links` was missing from this list, so it never appeared in an
  // export. (Deletion still reached it, but only incidentally, via the cascade
  // from broker_connections.)
  'copier_links',
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
  /** Public URLs of every uploaded screenshot referenced by those rows. */
  imageUrls: string[]
}

/** Reads every user-owned table. RLS already scopes each query to auth.uid(),
 * so there's no user filter here — the same reason the rest of src/db doesn't
 * pass one either.
 *
 * Every table goes through selectAll. A bare `.select('*')` stops at
 * PostgREST's 1000-row max-rows without saying so, and it did here: an export
 * is the one read where a silent truncation is unrecoverable, because the
 * person taking it believes they now hold everything and may well delete the
 * account next. Ordered by id, which every one of these tables has. */
export async function exportAllData(userId: string): Promise<ExportBundle> {
  const tables: Record<string, unknown[]> = {}
  for (const table of USER_TABLES) {
    tables[table] = await selectAll(table, { orderBy: 'id' })
  }
  const { data: profile, error: profileError } = await supabase
    .from('eaglecapital_profiles')
    .select('*')
    .eq('user_id', userId)
  if (profileError) throw profileError
  tables.profile = profile ?? []

  return { exportedAt: new Date().toISOString(), tables, imageUrls: collectImageUrls(tables) }
}

/** Uploaded screenshots are files, not rows, so an export of the tables alone
 * would hand someone their notes without their charts. The bundle lists every
 * URL so they can be fetched; the bucket is public, so no signing is needed. */
function collectImageUrls(tables: Record<string, unknown[]>): string[] {
  const urls = new Set<string>()
  for (const row of tables.playbook_examples ?? []) {
    const url = (row as { image_url?: string | null }).image_url
    if (url) urls.add(url)
  }
  for (const row of tables.report_cards ?? []) {
    for (const url of (row as { image_urls?: string[] | null }).image_urls ?? []) {
      if (url) urls.add(url)
    }
  }
  return [...urls]
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

/* Erasure lives in db/accountDeletion.ts, not here.
 *
 * There used to be a `deleteAllUserData()` in this file that looped DELETEs
 * from the browser. It was wrong in three ways that no amount of care at the
 * call site could fix:
 *   · it could never remove the auth.users row (service-role only), so a
 *     "deleted" account could still sign in;
 *   · it never touched Storage, leaving every screenshot in a public bucket;
 *   · its delete against eaglecapital_profiles silently did nothing, because
 *     that table had no DELETE policy and RLS turns a blocked delete into a
 *     no-op rather than an error.
 *
 * Deletion is now a scheduled request with a 30-day window, carried out
 * server-side by the purge-deleted-accounts Edge Function. */
