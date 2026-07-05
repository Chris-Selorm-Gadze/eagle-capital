import { db, type Account, type SessionLog } from './schema'

export type SessionInput = Omit<SessionLog, 'id' | 'accountId'>

/** Upsert today's (or any date's) session for an account and roll the pnl into balance/highestBalance. */
export async function logSession(account: Account, input: SessionInput) {
  const existing = await db.sessions
    .where('accountId').equals(account.id!)
    .and((s) => s.date === input.date)
    .first()

  const pnlDelta = input.pnl - (existing?.pnl ?? 0)
  const newBalance = account.balance + pnlDelta
  const newHighest = Math.max(account.highestBalance, newBalance, input.highestUnrealized ?? 0)

  if (existing) {
    await db.sessions.update(existing.id!, input)
  } else {
    await db.sessions.add({ ...input, accountId: account.id! })
  }
  await db.accounts.update(account.id!, { balance: newBalance, highestBalance: newHighest })
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
