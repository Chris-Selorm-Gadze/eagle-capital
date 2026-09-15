import { useState } from 'react'
import type { Account, Payout } from '../../../db/schema'
import { recordPayout, deletePayout } from '../../../db/payouts'
import { todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'
import styles from './PayoutPlannerDialog.module.css'
import { errorMessage } from '../../../utils/errors'
import { useConfirm } from '../../../shared/ui/confirm'

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
  const confirm = useConfirm()
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
      await recordPayout(userId, account.id!, date, Number(requested), Number(received))
      setRequested('')
      setReceived('')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // A payout moves the account's balance, so a mistyped one has to be
  // removable — otherwise the only way to correct it is another payout with
  // negative amounts.
  async function remove(payout: Payout) {
    if (!(await confirm({
      title: 'Delete this payout?',
      description: `${payout.date} — requested $${payout.requested.toLocaleString()}. The account balance goes back up by that amount.`,
      confirmLabel: 'Delete payout',
      destructive: true,
    }))) return
    setError(null)
    try {
      await deletePayout(payout.id!)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
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
          <button className="btn-primary" onClick={save} disabled={!requested || !received || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p className={styles.hint}>
        <strong>Requested</strong> is what the firm takes out of the account. <strong>Received</strong>
        {' '}is what reaches you after the profit split — so the two differ on most funded accounts.
      </p>

      {sorted.length > 0 && (
        <ul className={styles.history}>
          {sorted.map((p) => (
            <li key={p.id}>
              <span>{p.date}: requested ${p.requested.toLocaleString()} · received ${p.received.toLocaleString()}</span>
              <button className={styles.rowDelete} onClick={() => remove(p)} aria-label={`Delete payout from ${p.date}`}>
                Delete
              </button>
            </li>
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
