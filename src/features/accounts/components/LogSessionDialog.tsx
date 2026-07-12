import { useState } from 'react'
import type { Account } from '../../../db/schema'
import { logSession, todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'
import { errorMessage } from '../../../utils/errors'
import { usePostHog } from '@posthog/react'

export function LogSessionDialog({
  account,
  userId,
  onClose,
  onSaved,
}: {
  account: Account
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [pnl, setPnl] = useState('0')
  const [trades, setTrades] = useState('0')
  const [consecutiveLosses, setConsecutiveLosses] = useState('0')
  const [highestUnrealized, setHighestUnrealized] = useState('')
  const [rulesFollowed, setRulesFollowed] = useState(true)
  const [notes, setNotes] = useState('')

  const posthog = usePostHog()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await logSession(userId, account, {
        date: todayISO(),
        pnl: Number(pnl),
        trades: Number(trades),
        consecutiveLosses: Number(consecutiveLosses),
        highestUnrealized: highestUnrealized === '' ? undefined : Number(highestUnrealized),
        rulesFollowed,
        notes: notes || undefined,
      })
      posthog?.capture('session_logged', {
        session_pnl_positive: Number(pnl) >= 0,
        session_trade_count: Number(trades),
        rules_followed: rulesFollowed,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Log session — ${account.label}`}
      onClose={onClose}
      minWidth={320}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{todayISO()}</div>

      <label className="field">
        P&amp;L
        <input type="number" value={pnl} onChange={(e) => setPnl(e.target.value)} />
      </label>

      <label className="field">
        Trades
        <input type="number" value={trades} onChange={(e) => setTrades(e.target.value)} />
      </label>

      <label className="field">
        Consecutive losses today
        <input type="number" value={consecutiveLosses} onChange={(e) => setConsecutiveLosses(e.target.value)} />
      </label>

      <label className="field">
        Highest unrealized balance (optional)
        <input type="number" value={highestUnrealized} onChange={(e) => setHighestUnrealized(e.target.value)} />
      </label>

      <label className="field-checkbox">
        <input type="checkbox" checked={rulesFollowed} onChange={(e) => setRulesFollowed(e.target.checked)} />
        Rules followed
      </label>

      <label className="field">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
