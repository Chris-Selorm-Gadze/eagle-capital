import { db, type Account } from './schema'
import { traderShare } from '../domain/apex'

export async function lastPayoutDate(accountId: number): Promise<string | undefined> {
  const rows = await db.payouts.where('accountId').equals(accountId).sortBy('date')
  return rows.at(-1)?.date
}

/** Record a payout request/receipt, applying the 100%-then-90% split and bumping the account's counters. */
export async function recordPayout(account: Account, date: string, requested: number) {
  const cumulativePaid = account.cumulativePaid ?? 0
  const received = traderShare(cumulativePaid, requested)
  await db.payouts.add({ accountId: account.id!, date, requested, received })
  await db.accounts.update(account.id!, {
    payoutsDone: (account.payoutsDone ?? 0) + 1,
    cumulativePaid: cumulativePaid + received,
    balance: account.balance - requested,
  })
}
