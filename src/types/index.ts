export type FnModel = 'stellar-1step' | 'stellar-2step' | 'stellar-lite'

export interface Account {
  id?: number
  firmId: string           // references propFirms catalog (e.g. 'apex', 'fundednext', 'ftmo', 'other')
  customFirmName?: string  // only if firmId === 'other'
  label: string            // user's label, e.g. "FTMO 100K #2"
  accountNumber?: string   // optional: broker/firm account number
  
  size: number             // account size (initial capital)
  balance: number          // current balance
  highestBalance: number   // for trailing drawdown tracking
  currency?: string        // default 'USD'
  
  stage: 'challenge' | 'phase2' | 'verification' | 'funded' | 'evaluation' | 'pa' | 'planned' | 'blown' | 'inactive'
  
  // User-defined risk parameters
  maxDrawdown?: number       // absolute $ max drawdown
  dailyLossLimit?: number    // absolute $ daily loss limit
  profitTarget?: number      // absolute $ profit target for current stage
  trailingDrawdown?: boolean // whether drawdown is trailing
  
  fundedDate?: string      // ISO date: when it became funded
  active: boolean          // active/inactive in cockpit
  notes?: string
  
  // Legacy / Migration fields (for backward compatibility)
  firm?: 'fundednext' | 'apex'
  model?: FnModel
  platform?: 'rithmic' | 'tradovate'
  qualifyingCycles?: number
  scaleEvents?: number
  payoutsDone?: number
  cumulativePaid?: number
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
