import { db, type Account } from './schema'

export type NewAccountInput = Pick<Account, 'firm' | 'label' | 'size' | 'stage' | 'active'> &
  Partial<Pick<Account, 'model' | 'platform' | 'balance' | 'highestBalance'>>

/** Creates a new account. Balance/highestBalance default to the starting size;
 * firm-specific counters (cycles/scale events for FundedNext, payouts for Apex) start at 0. */
export async function addAccount(input: NewAccountInput): Promise<number> {
  const balance = input.balance ?? input.size
  const highestBalance = input.highestBalance ?? balance

  const account: Account = {
    firm: input.firm,
    label: input.label,
    size: input.size,
    stage: input.stage,
    active: input.active,
    balance,
    highestBalance,
    ...(input.model && { model: input.model }),
    ...(input.platform && { platform: input.platform }),
    ...(input.firm === 'fundednext' && { qualifyingCycles: 0, scaleEvents: 0 }),
    ...(input.firm === 'apex' && { payoutsDone: 0, cumulativePaid: 0 }),
  }

  return db.accounts.add(account)
}

export async function setAccountActive(id: number, active: boolean) {
  await db.accounts.update(id, { active })
}
