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
  active: boolean // false = not currently trading this account; hidden from the Risk Cockpit's main view
}

export const STAGE_OPTIONS: Account['stage'][] = ['challenge', 'phase2', 'funded', 'evaluation', 'pa', 'planned', 'blown']

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

export interface Trade {
  id?: number
  accountId: number
  date: string // ISO date, entryTime's date — for calendar/day grouping
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  exitPrice: number
  entryTime: string // ISO datetime
  exitTime: string // ISO datetime
  fees?: number
  pnl: number // computed at save time: (exit-entry)*qty*dir - fees
  notes?: string
}

class PropDb extends Dexie {
  accounts!: Table<Account>
  sessions!: Table<SessionLog>
  payouts!: Table<Payout>
  rewards!: Table<Reward>
  trades!: Table<Trade>
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
    this.version(3).stores({
      accounts: '++id,firm,stage',
      sessions: '++id,accountId,date',
      payouts: '++id,accountId,date',
      rewards: '++id,accountId,date',
      trades: '++id,accountId,date',
    })
    this.version(4).stores({
      accounts: '++id,firm,stage,active',
      sessions: '++id,accountId,date',
      payouts: '++id,accountId,date',
      rewards: '++id,accountId,date',
      trades: '++id,accountId,date',
    }).upgrade((tx) =>
      tx.table('accounts').toCollection().modify((a: Account) => {
        // Accounts created before "active" existed: treat non-planned FundedNext
        // accounts as the ones actually being traded, everything else as dormant.
        a.active = a.firm === 'fundednext' && a.stage !== 'planned'
      })
    )
  }
}

export const db = new PropDb()
