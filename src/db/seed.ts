import { db, type Account } from './schema'

const SEED: Account[] = [
  { firm: 'fundednext', label: 'FN 5K', model: 'stellar-2step', size: 5_000, stage: 'phase2', balance: 5_000, highestBalance: 5_000, qualifyingCycles: 0, scaleEvents: 0 },
  { firm: 'fundednext', label: 'FN 15K', model: 'stellar-1step', size: 15_000, stage: 'challenge', balance: 15_000, highestBalance: 15_000, qualifyingCycles: 0, scaleEvents: 0 },
  { firm: 'fundednext', label: 'FN 25K (planned Aug)', model: 'stellar-1step', size: 25_000, stage: 'planned', balance: 25_000, highestBalance: 25_000 },
  { firm: 'fundednext', label: 'FN 50K (planned Sep)', model: 'stellar-1step', size: 50_000, stage: 'planned', balance: 50_000, highestBalance: 50_000 },
  { firm: 'fundednext', label: 'FN 100K (planned Oct)', model: 'stellar-1step', size: 100_000, stage: 'planned', balance: 100_000, highestBalance: 100_000 },
  { firm: 'apex', label: 'Apex 250K #1', size: 250_000, stage: 'evaluation', platform: 'rithmic', balance: 250_000, highestBalance: 250_000, payoutsDone: 0, cumulativePaid: 0 },
  { firm: 'apex', label: 'Apex 250K #2', size: 250_000, stage: 'evaluation', platform: 'rithmic', balance: 250_000, highestBalance: 250_000, payoutsDone: 0, cumulativePaid: 0 },
  { firm: 'apex', label: 'Apex 250K #3', size: 250_000, stage: 'evaluation', platform: 'rithmic', balance: 250_000, highestBalance: 250_000, payoutsDone: 0, cumulativePaid: 0 },
  { firm: 'apex', label: 'Apex 250K #4', size: 250_000, stage: 'evaluation', platform: 'rithmic', balance: 250_000, highestBalance: 250_000, payoutsDone: 0, cumulativePaid: 0 },
]

export async function seedIfEmpty() {
  if ((await db.accounts.count()) === 0) await db.accounts.bulkAdd(SEED)
}
