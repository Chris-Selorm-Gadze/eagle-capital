// Permanently erases accounts whose 30-day retention window has expired.
//
// This is the half of "delete my account" the browser cannot do, and used to
// simply not happen:
//   · auth.users rows can only be removed with the service-role key, which must
//     never reach a browser — so a "deleted" account could still sign in;
//   · Storage objects are not touched by any table cascade, so every uploaded
//     playbook and report-card screenshot stayed in a PUBLIC bucket forever, at
//     a URL that still resolved to it.
//
// Invocation: a scheduler (Supabase cron / GitHub Action / any cron that can
// POST) hits this once a day with the shared secret. It is NOT user-callable —
// deploy it with `--no-verify-jwt` and rely on the secret below, because a cron
// has no user JWT to present:
//
//   supabase secrets set PURGE_SECRET="$(openssl rand -hex 32)"
//   supabase functions deploy purge-deleted-accounts --no-verify-jwt
//
// Then schedule (Supabase Dashboard → Database → Cron, or pg_cron):
//   select cron.schedule('purge-deleted-accounts', '17 3 * * *', $$
//     select net.http_post(
//       url := '<project-url>/functions/v1/purge-deleted-accounts',
//       headers := '{"x-purge-secret": "<the secret>"}'::jsonb
//     );
//   $$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'playbook-images'

/** Child-first, matching src/db/userData.ts. Deleting the auth.users row
 * cascades all of these anyway (every table's user_id is ON DELETE CASCADE) —
 * this runs first so that a failure to remove the auth row can't leave the data
 * behind, which is the outcome that actually matters to a user who asked to be
 * forgotten. */
const USER_TABLES = [
  'playbook_examples',
  'broker_connection_accounts',
  'copier_links',
  'trades',
  'sessions',
  'payouts',
  'rewards',
  'report_cards',
  'trading_rules',
  'ai_insights',
  'ai_usage',
  'playbooks',
  'broker_connections',
  'accounts',
  'eaglecapital_profiles',
] as const

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Client = ReturnType<typeof createClient>

/** Every object path under a prefix, walking into subfolders.
 *
 * Storage's list() is not recursive: report-card images live under
 * `<uid>/report-cards/`, which comes back as a folder entry (id === null)
 * rather than a file, so a non-recursive delete would miss all of them. */
async function listAllPaths(supabase: Client, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: pageSize, offset })
    if (error) throw new Error(`list ${prefix}: ${error.message}`)
    const entries = data ?? []

    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`
      // A folder placeholder has no id; anything with one is a real object.
      if (entry.id === null) paths.push(...(await listAllPaths(supabase, path)))
      else paths.push(path)
    }

    if (entries.length < pageSize) break
  }
  return paths
}

async function purgeUser(supabase: Client, userId: string): Promise<{ storageObjects: number }> {
  // 1. Storage. Nothing cascades to it, so this has to be explicit — and it has
  //    to happen while we still know the user id.
  const paths = await listAllPaths(supabase, userId)
  if (paths.length > 0) {
    // remove() caps the number of keys per call; chunk to stay well under it.
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
      if (error) throw new Error(`remove objects: ${error.message}`)
    }
  }

  // 2. Table rows.
  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(`delete ${table}: ${error.message}`)
  }

  // 3. The auth identity itself — the step no browser client can perform.
  const { error: authError } = await supabase.auth.admin.deleteUser(userId)
  if (authError) throw new Error(`delete auth user: ${authError.message}`)

  // 4. The request row last, so a failure anywhere above leaves the job queued
  //    for the next run instead of silently dropping it.
  const { error: reqError } = await supabase.from('account_deletions').delete().eq('user_id', userId)
  if (reqError) throw new Error(`delete request row: ${reqError.message}`)

  return { storageObjects: paths.length }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PURGE_SECRET')
  if (!secret) return json({ error: 'PURGE_SECRET is not configured.' }, 500)
  // Constant-time-ish comparison isn't meaningful over a network boundary here,
  // but a length check before the compare avoids leaking length via early exit.
  const provided = req.headers.get('x-purge-secret') ?? ''
  if (provided.length !== secret.length || provided !== secret) {
    return json({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: due, error } = await supabase
    .from('account_deletions')
    .select('user_id, purge_after')
    .lte('purge_after', new Date().toISOString())
  if (error) return json({ error: `query due deletions: ${error.message}` }, 500)

  const purged: string[] = []
  const failed: { userId: string; error: string }[] = []

  for (const row of due ?? []) {
    const userId = row.user_id as string
    try {
      await purgeUser(supabase, userId)
      purged.push(userId)
    } catch (err) {
      // One user's failure must not abandon the rest of the queue.
      failed.push({ userId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return json({
    checked: (due ?? []).length,
    purged: purged.length,
    failed,
  }, failed.length > 0 ? 207 : 200)
})
