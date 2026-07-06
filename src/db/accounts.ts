import { db, type Account } from './schema'

export type NewAccountInput = Omit<Account, 'id' | 'balance' | 'highestBalance'> &
  Partial<Pick<Account, 'balance' | 'highestBalance'>>

export async function addAccount(input: NewAccountInput): Promise<number> {
  const balance = input.balance ?? input.size
  const highestBalance = input.highestBalance ?? balance

  const account: Account = {
    ...input,
    balance,
    highestBalance,
  }

  // Set legacy fields for backwards compatibility with existing UI/logic
  if (account.firmId === 'fundednext') {
    account.firm = 'fundednext'
    if (account.qualifyingCycles === undefined) account.qualifyingCycles = 0
    if (account.scaleEvents === undefined) account.scaleEvents = 0
  } else if (account.firmId === 'apex') {
    account.firm = 'apex'
    if (account.payoutsDone === undefined) account.payoutsDone = 0
    if (account.cumulativePaid === undefined) account.cumulativePaid = 0
  }

  return db.accounts.add(account)
}

export async function setAccountActive(id: number, active: boolean) {
  await db.accounts.update(id, { active })
}
