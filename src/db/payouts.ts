import { db, type Account } from './schema'
import { traderShare } from '../features/risk/payoutRules'

export async function lastPayoutDate(accountId: number): Promise<string | undefined> {
  const rows = await db.payouts.where('accountId').equals(accountId).sortBy('date')
  return rows.at(-1)?.date
}

/** Record a payout request/receipt, applying the account's own split rule and bumping its counters. */
export async function recordPayout(account: Account, date: string, requested: number) {
  if (!account.payoutRules) throw new Error('Account has no payout rules configured')
  const cumulativePaid = account.cumulativePaid ?? 0
  const received = traderShare(account.payoutRules, cumulativePaid, requested)
  await db.payouts.add({ accountId: account.id!, date, requested, received })
  await db.accounts.update(account.id!, {
    payoutsDone: (account.payoutsDone ?? 0) + 1,
    cumulativePaid: cumulativePaid + received,
    balance: account.balance - requested,
  })
}
