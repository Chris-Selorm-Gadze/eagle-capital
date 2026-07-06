import type { Account, SessionLog } from '../../db/schema'
import { circuitBreaker, consecutiveRedDays, applyApexCopierRisk, type BreakerLevel } from './risk'
import { computeAccountRisk } from './accountRisk'

/** Own circuit-breaker level for an account, from its session history up to and including today. */
export function ownBreakerLevel(account: Account, sessionsForAccount: SessionLog[], today: string): BreakerLevel {
  const sortedDesc = [...sessionsForAccount].sort((a, b) => (a.date < b.date ? 1 : -1))
  const todaySession = sortedDesc.find((s) => s.date === today)
  const redDays = consecutiveRedDays(sortedDesc.map((s) => s.pnl))
  const { stop } = computeAccountRisk(account)
  return circuitBreaker({
    consecutiveLosses: todaySession?.consecutiveLosses ?? 0,
    dayPnl: todaySession?.pnl ?? 0,
    dailyStopAmount: stop,
    consecutiveRedDays: redDays,
  })
}

/** Effective level per account after applying Apex trade-copier propagation across all Apex accounts. */
export function effectiveBreakerLevels(
  accounts: Account[],
  sessionsByAccountId: Map<number, SessionLog[]>,
  today: string,
): Map<number, BreakerLevel> {
  const own = new Map<number, BreakerLevel>()
  for (const a of accounts) {
    own.set(a.id!, ownBreakerLevel(a, sessionsByAccountId.get(a.id!) ?? [], today))
  }
  const apexIds = accounts.filter((a) => a.firm === 'apex').map((a) => a.id!)
  const apexLevels = apexIds.map((id) => own.get(id)!)

  const effective = new Map<number, BreakerLevel>()
  for (const a of accounts) {
    const id = a.id!
    effective.set(id, a.firm === 'apex' ? applyApexCopierRisk(own.get(id)!, apexLevels) : own.get(id)!)
  }
  return effective
}
