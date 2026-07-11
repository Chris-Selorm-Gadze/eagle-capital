import type { Account } from '../types'

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
  'inactive',
  'live',
]

// Data lives in Supabase (per-user, RLS-scoped) — see src/db/accounts.ts, sessions.ts,
// payouts.ts, rewards.ts, trades.ts. This file only keeps type re-exports and shared constants.
