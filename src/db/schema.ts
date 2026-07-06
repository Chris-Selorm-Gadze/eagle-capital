import Dexie, { type Table } from 'dexie'
import type { Account, SessionLog, Payout, Reward, Trade } from '../types'

export type { Account, SessionLog, Payout, Reward, Trade } from '../types'

export const STAGE_OPTIONS: Account['stage'][] = [
  'challenge',
  'phase2',
  'verification',
  'funded',
  'evaluation',
  'pa',
  'planned',
  'blown',
  'inactive'
]

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
        a.active = a.firm === 'fundednext' && a.stage !== 'planned'
      })
    )
    this.version(5).stores({
      accounts: '++id,firmId,stage,active',
      sessions: '++id,accountId,date',
      payouts: '++id,accountId,date',
      rewards: '++id,accountId,date',
      trades: '++id,accountId,date',
    }).upgrade((tx) =>
      tx.table('accounts').toCollection().modify((a: any) => {
        // Map legacy firm to firmId
        if (a.firm) {
          a.firmId = a.firm
        } else if (!a.firmId) {
          a.firmId = 'other'
        }

        // Default currency
        a.currency = 'USD'

        // Backfill user-defined risk limits based on legacy firm models
        if (a.firmId === 'fundednext') {
          const model = a.model || 'stellar-2step'
          const size = a.size || 5000
          if (model === 'stellar-1step') {
            a.maxDrawdown = size * 0.06
            a.dailyLossLimit = size * 0.03
          } else if (model === 'stellar-lite') {
            a.maxDrawdown = size * 0.08
            a.dailyLossLimit = size * 0.04
          } else {
            a.maxDrawdown = size * 0.10
            a.dailyLossLimit = size * 0.05
          }
          a.trailingDrawdown = false
        } else if (a.firmId === 'apex') {
          a.maxDrawdown = 6500
          a.dailyLossLimit = 0
          a.trailingDrawdown = true
          a.profitTarget = 15000
        }
      })
    )
  }
}

export const db = new PropDb()
