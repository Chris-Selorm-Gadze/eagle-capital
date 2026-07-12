import { supabase } from '../lib/supabaseClient'
import type { ReportCard } from '../types'

function fromRow(row: Record<string, any>): ReportCard {
  return {
    id: row.id,
    date: row.date,
    dayOfWeek: row.day_of_week ?? undefined,
    instrument: row.instrument ?? undefined,
    session: row.session ?? undefined,
    tradeIds: row.trade_ids ?? undefined,
    imageUrls: row.image_urls ?? undefined,
    tradesTaken: row.trades_taken ?? undefined,
    wins: row.wins ?? undefined,
    losses: row.losses ?? undefined,
    netPnl: row.net_pnl ?? undefined,
    largestWin: row.largest_win ?? undefined,
    largestLoss: row.largest_loss ?? undefined,
    maxConsecutiveLosses: row.max_consecutive_losses ?? undefined,
    ruleChecks: row.rule_checks ?? undefined,
    grade: row.grade ?? undefined,
    fitState: row.fit_state ?? undefined,
    planOrFeelings: row.plan_or_feelings ?? undefined,
    whyProblem: row.why_problem ?? undefined,
    why1: row.why_1 ?? undefined,
    why2: row.why_2 ?? undefined,
    why3: row.why_3 ?? undefined,
    why4: row.why_4 ?? undefined,
    why5: row.why_5 ?? undefined,
    rootCause: row.root_cause ?? undefined,
    counterMeasure: row.counter_measure ?? undefined,
    didWell: row.did_well ?? undefined,
    mustImprove: row.must_improve ?? undefined,
    passedSetup: row.passed_setup ?? undefined,
    allowedTomorrow: row.allowed_tomorrow ?? undefined,
    noteToTomorrow: row.note_to_tomorrow ?? undefined,
  }
}

function toRow(c: ReportCard): Record<string, unknown> {
  return {
    date: c.date,
    day_of_week: c.dayOfWeek,
    instrument: c.instrument,
    session: c.session,
    trade_ids: c.tradeIds ?? null,
    image_urls: c.imageUrls ?? null,
    trades_taken: c.tradesTaken,
    wins: c.wins,
    losses: c.losses,
    net_pnl: c.netPnl,
    largest_win: c.largestWin,
    largest_loss: c.largestLoss,
    max_consecutive_losses: c.maxConsecutiveLosses,
    rule_checks: c.ruleChecks ?? {},
    grade: c.grade,
    fit_state: c.fitState,
    plan_or_feelings: c.planOrFeelings,
    why_problem: c.whyProblem,
    why_1: c.why1, why_2: c.why2, why_3: c.why3, why_4: c.why4, why_5: c.why5,
    root_cause: c.rootCause,
    counter_measure: c.counterMeasure,
    did_well: c.didWell,
    must_improve: c.mustImprove,
    passed_setup: c.passedSetup,
    allowed_tomorrow: c.allowedTomorrow,
    note_to_tomorrow: c.noteToTomorrow,
    updated_at: new Date().toISOString(),
  }
}

/** The report card for one date, or null if nothing's been saved yet. */
export async function getReportCard(date: string): Promise<ReportCard | null> {
  const { data, error } = await supabase
    .from('report_cards')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

/** Upserts by (user_id, date) — one report card per user per day. */
export async function saveReportCard(userId: string, card: ReportCard): Promise<void> {
  const { error } = await supabase
    .from('report_cards')
    .upsert({ user_id: userId, ...toRow(card) }, { onConflict: 'user_id,date' })
  if (error) throw error
}

/** Every saved report card for the signed-in user, most recent first. */
export async function listReportCards(): Promise<ReportCard[]> {
  const { data, error } = await supabase
    .from('report_cards')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}
