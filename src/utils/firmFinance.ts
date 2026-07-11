import type { Account, Payout, SessionLog } from '../db/schema'

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export interface FirmFinance {
  firmId: string
  spent: number
  earned: number
  net: number
}

/** Per-firm spent (challenge costs) vs earned (payouts received) vs net. */
export function firmFinanceBreakdown(accounts: Account[], payoutsByAccountId: Map<string, Payout[]>): FirmFinance[] {
  const byFirm = new Map<string, { spent: number; earned: number }>()
  for (const a of accounts) {
    if (!a.firmId) continue // 'live' accounts have no firm — nothing to roll up here
    const entry = byFirm.get(a.firmId) ?? { spent: 0, earned: 0 }
    entry.spent += a.cost ?? 0
    const payouts = a.id !== undefined ? (payoutsByAccountId.get(a.id) ?? []) : []
    entry.earned += payouts.reduce((sum, p) => sum + p.received, 0)
    byFirm.set(a.firmId, entry)
  }
  return [...byFirm.entries()].map(([firmId, { spent, earned }]) => ({ firmId, spent, earned, net: earned - spent }))
}

export interface FirmPassRate {
  firmId: string
  passed: number
  total: number
  pct: number
}

const PASSED_STAGES: Account['stage'][] = ['funded', 'pa']

/** Per-firm pass rate: passed / total purchased attempts (excludes 'planned' — not yet started). */
export function firmPassRate(accounts: Account[]): FirmPassRate[] {
  const byFirm = new Map<string, { passed: number; total: number }>()
  for (const a of accounts) {
    if (a.stage === 'planned' || !a.firmId) continue
    const entry = byFirm.get(a.firmId) ?? { passed: 0, total: 0 }
    entry.total += 1
    if (PASSED_STAGES.includes(a.stage)) entry.passed += 1
    byFirm.set(a.firmId, entry)
  }
  return [...byFirm.entries()].map(([firmId, { passed, total }]) => ({
    firmId,
    passed,
    total,
    pct: total === 0 ? 0 : passed / total,
  }))
}

const EVAL_STAGES: Account['stage'][] = ['challenge', 'phase2', 'verification', 'evaluation']

export interface PathToFundingProgress {
  profitPct: number
  daysPct: number | null
  dailyLossPct: number | null
}

/** null when the account isn't in an evaluation-like stage — nothing to show progress toward. */
export function pathToFundingProgress(
  account: Account,
  sessionsForAccount: SessionLog[],
  todayISODate: string,
): PathToFundingProgress | null {
  if (!EVAL_STAGES.includes(account.stage)) return null

  const profitPct = account.profitTarget ? clamp01((account.balance - account.size) / account.profitTarget) : 0

  const daysPct = account.minTradingDays ? clamp01(sessionsForAccount.length / account.minTradingDays) : null

  const todaySession = sessionsForAccount.find((s) => s.date === todayISODate)
  const dailyLossPct = account.dailyLossLimit
    ? clamp01(Math.max(0, -(todaySession?.pnl ?? 0)) / account.dailyLossLimit)
    : null

  return { profitPct, daysPct, dailyLossPct }
}

export interface BreachReasonCount {
  reason: string
  count: number
}

/** Counts blownReason across 'blown' accounts, most common first. */
export function breachReasonCounts(accounts: Account[]): BreachReasonCount[] {
  const counts = new Map<string, number>()
  for (const a of accounts) {
    if (a.stage !== 'blown' || !a.blownReason) continue
    counts.set(a.blownReason, (counts.get(a.blownReason) ?? 0) + 1)
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}
