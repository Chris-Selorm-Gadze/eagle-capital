import { db, type Account, type SessionLog, type Payout, type Reward } from './schema'
import { todayISO } from './sessions'

export interface Backup {
  exportedAt: string
  accounts: Account[]
  sessions: SessionLog[]
  payouts: Payout[]
  rewards: Reward[]
}

export async function exportBackup(): Promise<Backup> {
  const [accounts, sessions, payouts, rewards] = await Promise.all([
    db.accounts.toArray(),
    db.sessions.toArray(),
    db.payouts.toArray(),
    db.rewards.toArray(),
  ])
  return { exportedAt: new Date().toISOString(), accounts, sessions, payouts, rewards }
}

export function downloadBackup(backup: Backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prop-tracker-backup-${todayISO()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function isBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Record<string, unknown>
  return Array.isArray(b.accounts) && Array.isArray(b.sessions) && Array.isArray(b.payouts) && Array.isArray(b.rewards)
}

export async function parseBackupFile(file: File): Promise<Backup> {
  const parsed = JSON.parse(await file.text())
  if (!isBackup(parsed)) throw new Error('Not a valid Prop Tracker backup file')
  return parsed
}

/** Wipes the local DB and restores it from a backup. Irreversible without another backup. */
export async function importBackup(backup: Backup) {
  await db.transaction('rw', db.accounts, db.sessions, db.payouts, db.rewards, async () => {
    await Promise.all([db.accounts.clear(), db.sessions.clear(), db.payouts.clear(), db.rewards.clear()])
    await Promise.all([
      db.accounts.bulkAdd(backup.accounts),
      db.sessions.bulkAdd(backup.sessions),
      db.payouts.bulkAdd(backup.payouts),
      db.rewards.bulkAdd(backup.rewards),
    ])
  })
}
