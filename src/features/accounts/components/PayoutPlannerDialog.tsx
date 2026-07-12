import { useState } from 'react'
import type { Account, Payout } from '../../../db/schema'
import { recordPayout } from '../../../db/payouts'
import { todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'
import styles from './PayoutPlannerDialog.module.css'
import { errorMessage } from '../../../utils/errors'
import { usePostHog } from '@posthog/react'

export function PayoutPlannerDialog({
  account,
  payouts,
  userId,
  onClose,
  onSaved,
}: {
  account: Account
  payouts: Payout[]
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const posthog = usePostHog()
  const [date, setDate] = useState(todayISO())
  const [requested, setRequested] = useState('')
  const [received, setReceived] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...payouts].sort((a, b) => (a.date < b.date ? -1 : 1))

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await recordPayout(userId, account, date, Number(requested), Number(received))
      posthog?.capture('payout_recorded', {
        payout_requested_amount: Number(requested),
        payout_received_amount: Number(received),
      })
      setRequested('')
      setReceived('')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Payouts — ${account.label}`}
      onClose={onClose}
      minWidth={380}
      footer={
        <>
          <button onClick={onClose}>Close</button>
          <button onClick={save} disabled={!requested || !received || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {sorted.length > 0 && (
        <ul className={styles.history}>
          {sorted.map((p) => (
            <li key={p.id}>{p.date}: requested ${p.requested.toLocaleString()} · received ${p.received.toLocaleString()}</li>
          ))}
        </ul>
      )}

      <div className="field-row" style={{ marginTop: '1rem' }}>
        <label className="flex-1">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex-1">Requested $
          <input type="number" value={requested} onChange={(e) => setRequested(e.target.value)} />
        </label>
        <label className="flex-1">Received $
          <input type="number" value={received} onChange={(e) => setReceived(e.target.value)} />
        </label>
      </div>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
