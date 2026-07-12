export interface Account {
  id?: string
  // Optional because 'live' accounts (see stage below) have no prop firm at all — not every
  // account added is or will be a prop-firm evaluation/funded account, especially now that real
  // broker accounts (via broker_connections) are being connected directly.
  firmId?: string          // references propFirms catalog (e.g. 'apex', 'fundednext', 'ftmo', 'other')
  customFirmName?: string  // only if firmId === 'other'
  label: string            // user's label, e.g. "FTMO 100K #2"
  accountNumber?: string   // optional: broker/firm account number

  size: number             // account size (initial capital)
  balance: number          // current balance
  highestBalance: number   // for trailing drawdown tracking
  currency?: string        // default 'USD'

  // 'live' means a real/personal broker account with no prop-firm rules to track — skips
  // firmId and every risk-management field below entirely (see AddAccountDialog.tsx).
  stage: 'challenge' | 'phase2' | 'verification' | 'funded' | 'evaluation' | 'pa' | 'planned' | 'blown' | 'inactive' | 'live'
  
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

  // Journal fields — planned risk, review rating, and free-form tags, all optional/manual
  stopLoss?: number
  profitTarget?: number
  rating?: number // 1-5
  tags?: string[]
}

export type ReportCardGrade = 'A' | 'B' | 'C' | 'R'

/** Post-session review, one per user per day — tracks the trader, not a specific prop-firm account. */
export interface ReportCard {
  id?: string
  date: string // ISO date
  dayOfWeek?: string
  instrument?: string
  session?: string
  tradeIds?: string[] // real logged trades this report is written about
  imageUrls?: string[] // screenshots of the attached trades

  tradesTaken?: number
  wins?: number
  losses?: number
  netPnl?: string
  largestWin?: string
  largestLoss?: string
  maxConsecutiveLosses?: number

  // Execution checklist — keyed by the user's own TradingRule.id, not a fixed generic list, so
  // it's personalized to whatever rules each user has actually created in Trader Management.
  ruleChecks?: Record<string, boolean>

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
