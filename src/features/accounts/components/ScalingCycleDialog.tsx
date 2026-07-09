import { useState } from 'react'
import type { Account, Reward } from '../../../db/schema'
import { addReward } from '../../../db/rewards'
import { updateAccount } from '../../../db/accounts'
import { todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'
import { errorMessage } from '../../../utils/errors'

export function ScalingCycleDialog({
  account,
  rewards,
  userId,
  onClose,
  onSaved,
}: {
  account: Account
  rewards: Reward[]
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [growthPct, setGrowthPct] = useState('')
  const [fundedDate, setFundedDate] = useState(account.fundedDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...rewards].sort((a, b) => (a.date < b.date ? -1 : 1))

  async function saveFundedDate() {
    setError(null)
    try {
      await updateAccount(account.id!, { fundedDate })
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function saveReward() {
    setError(null)
    setSaving(true)
    try {
      await addReward(userId, account.id!, todayISO(), Number(growthPct) / 100)
      setGrowthPct('')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Scaling tracker — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={onClose}>Close</button>
          <button onClick={saveReward} disabled={!growthPct || saving}>{saving ? 'Saving…' : 'Log reward'}</button>
        </>
      }
    >
      <label className="field">
        Funded date
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <input type="date" value={fundedDate} onChange={(e) => setFundedDate(e.target.value)} style={{ flex: 1 }} />
          <button onClick={saveFundedDate}>Set</button>
        </div>
      </label>

      <label className="field" style={{ marginTop: '1rem' }}>
        Log performance reward — growth %
        <input type="number" step="0.1" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} />
      </label>

      {sorted.length > 0 && (
        <ul style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.2rem' }}>
          {sorted.map((r) => (
            <li key={r.id}>{r.date}: {(r.growthPct * 100).toFixed(1)}%</li>
          ))}
        </ul>
      )}

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
