import { db } from './schema'

export async function addReward(accountId: number, date: string, growthPct: number) {
  await db.rewards.add({ accountId, date, growthPct })
}
