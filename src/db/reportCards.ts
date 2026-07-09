import { supabase } from '../lib/supabaseClient'
import type { ReportCard } from '../types'

function fromRow(row: Record<string, any>): ReportCard {
  return {
    id: row.id,
    date: row.date,
    dayOfWeek: row.day_of_week ?? undefined,
    instrument: row.instrument ?? undefined,
    session: row.session ?? undefined,
    tradesTaken: row.trades_taken ?? undefined,
    wins: row.wins ?? undefined,
    losses: row.losses ?? undefined,
    netPnl: row.net_pnl ?? undefined,
    largestWin: row.largest_win ?? undefined,
    largestLoss: row.largest_loss ?? undefined,
    maxConsecutiveLosses: row.max_consecutive_losses ?? undefined,
    rule1: row.rule_1 ?? undefined,
    rule2: row.rule_2 ?? undefined,
    rule3: row.rule_3 ?? undefined,
    rule4: row.rule_4 ?? undefined,
    rule5: row.rule_5 ?? undefined,
    rule6: row.rule_6 ?? undefined,
    rule7: row.rule_7 ?? undefined,
    rule8: row.rule_8 ?? undefined,
    rule9: row.rule_9 ?? undefined,
    rule10: row.rule_10 ?? undefined,
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
    trades_taken: c.tradesTaken,
    wins: c.wins,
    losses: c.losses,
    net_pnl: c.netPnl,
    largest_win: c.largestWin,
    largest_loss: c.largestLoss,
    max_consecutive_losses: c.maxConsecutiveLosses,
    rule_1: c.rule1, rule_2: c.rule2, rule_3: c.rule3, rule_4: c.rule4, rule_5: c.rule5,
    rule_6: c.rule6, rule_7: c.rule7, rule_8: c.rule8, rule_9: c.rule9, rule_10: c.rule10,
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
