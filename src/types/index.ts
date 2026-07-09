export interface Account {
  id?: string
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
  minTradingDays?: number    // min trading days required to complete the evaluation

  fundedDate?: string      // ISO date: when it became funded
  active: boolean          // active/inactive in cockpit
  notes?: string
  cost?: number            // one-time amount paid for this challenge/evaluation attempt
  blownReason?: string     // captured when stage is set to 'blown' — see breachReasons.ts

  // Payout tracking — generic across firms
  payoutsDone?: number
  cumulativePaid?: number
}

export interface SessionLog {
  id?: string
  accountId: string
  date: string // ISO date
  pnl: number
  trades: number
  consecutiveLosses: number
  highestUnrealized?: number
  rulesFollowed: boolean
  notes?: string
}

export interface Payout {
  id?: string
  accountId: string
  date: string
  requested: number
  received: number
}

export interface Reward {
  id?: string
  accountId: string
  date: string // ISO date
  growthPct: number // e.g. 0.05 for 5% growth
}

export interface Trade {
  id?: string
  accountId: string
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

export type ReportCardGrade = 'A' | 'B' | 'C' | 'R'

/** Post-session review, one per user per day — tracks the trader, not a specific prop-firm account. */
export interface ReportCard {
  id?: string
  date: string // ISO date
  dayOfWeek?: string
  instrument?: string
  session?: string

  tradesTaken?: number
  wins?: number
  losses?: number
  netPnl?: string
  largestWin?: string
  largestLoss?: string
  maxConsecutiveLosses?: number

  // 10-item execution checklist — rule1-4 are "Core", rule5-10 are "Rule"
  rule1?: boolean
  rule2?: boolean
  rule3?: boolean
  rule4?: boolean
  rule5?: boolean
  rule6?: boolean
  rule7?: boolean
  rule8?: boolean
  rule9?: boolean
  rule10?: boolean

  grade?: ReportCardGrade
  fitState?: string
  planOrFeelings?: string

  whyProblem?: string
  why1?: string
  why2?: string
  why3?: string
  why4?: string
  why5?: string
  rootCause?: string
  counterMeasure?: string

  didWell?: string
  mustImprove?: string
  passedSetup?: string
  allowedTomorrow?: string
  noteToTomorrow?: string
}

export type PlaybookGrade = 'A+' | 'A' | 'B' | 'C'

/** A documented trading setup/strategy the trader can grade and attach reference examples to. */
export interface Playbook {
  id?: string
  name: string
  description?: string
  grade?: PlaybookGrade
}

/** A reference example for a playbook — optionally tied to a real logged trade, optionally with an image. */
export interface PlaybookExample {
  id?: string
  playbookId: string
  tradeId?: string
  note?: string
  imageUrl?: string
}

/** A personal trading rule, managed under Trader Management — independent of any prop firm's rules. */
export interface TradingRule {
  id?: string
  text: string
  isCore?: boolean
}
