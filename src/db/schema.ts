import Dexie, { type Table } from 'dexie'
import type { FnModel } from '../domain/fundednext'

export interface Account {
  id?: number
  firm: 'fundednext' | 'apex'
  label: string
  model?: FnModel
  size: number
  stage: 'challenge' | 'phase2' | 'funded' | 'evaluation' | 'pa' | 'planned' | 'blown'
  platform?: 'rithmic' | 'tradovate'
  fundedDate?: string // ISO date
  qualifyingCycles?: number
  scaleEvents?: number
  payoutsDone?: number
  cumulativePaid?: number
  balance: number
  highestBalance: number // include unrealized peaks!
}

export interface SessionLog {
  id?: number
  accountId: number
  date: string // ISO date
  pnl: number
  trades: number
  consecutiveLosses: number
  highestUnrealized?: number
  rulesFollowed: boolean
  notes?: string
}

export interface Payout {
  id?: number
  accountId: number
  date: string
  requested: number
  received: number
}

export interface Reward {
  id?: number
  accountId: number
  date: string // ISO date
  growthPct: number // e.g. 0.05 for 5% growth
}

class PropDb extends Dexie {
  accounts!: Table<Account>
  sessions!: Table<SessionLog>
  payouts!: Table<Payout>
  rewards!: Table<Reward>
  constructor() {
    super('prop-tracker')
    this.version(1).stores({
      accounts: '++id,firm,stage',
      sessions: '++id,accountId,date',
      payouts: '++id,accountId,date',
    })
    this.version(2).stores({
      accounts: '++id,firm,stage',
      sessions: '++id,accountId,date',
      payouts: '++id,accountId,date',
      rewards: '++id,accountId,date',
    })
  }
}

export const db = new PropDb()
