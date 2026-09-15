import { supabase } from '../lib/supabaseClient'

/* PostgREST caps how many rows a single request may return — Supabase ships
 * with `max-rows = 1000`. Every list query in this app was a bare
 * `.select('*')`, so a user's 1001st trade simply stopped existing: no error,
 * no warning, just a dashboard quietly computing win rate and profit factor
 * over a truncated book.
 *
 * `selectAll` walks the result in ranges until a short page comes back, so the
 * caller always gets the whole table.
 */

/** Rows per request. Stays under the default `max-rows` so the server never
 * truncates a page out from under the range arithmetic. */
const PAGE_SIZE = 1000

export interface SelectAllOptions {
  /** Column to order by — required for stable paging; without a deterministic
   * order, ranges can skip or repeat rows between requests. */
  orderBy: string
  ascending?: boolean
}

export async function selectAll<T = Record<string, any>>(
  table: string,
  { orderBy, ascending = true }: SelectAllOptions,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      // `id` as a tiebreaker keeps the order total. Ordering by `date` alone
      // leaves rows sharing a date in an undefined order, which can drop or
      // duplicate one across a page boundary.
      .order(orderBy, { ascending })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}
