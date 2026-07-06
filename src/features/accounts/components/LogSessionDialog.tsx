import { useState } from 'react'
import type { Account } from '../../../db/schema'
import { logSession, todayISO } from '../../../db/sessions'
import { Modal } from '../../../shared/ui/Modal'

export function LogSessionDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [pnl, setPnl] = useState('0')
  const [trades, setTrades] = useState('0')
  const [consecutiveLosses, setConsecutiveLosses] = useState('0')
  const [highestUnrealized, setHighestUnrealized] = useState('')
  const [rulesFollowed, setRulesFollowed] = useState(true)
  const [notes, setNotes] = useState('')

  async function save() {
    await logSession(account, {
      date: todayISO(),
      pnl: Number(pnl),
      trades: Number(trades),
      consecutiveLosses: Number(consecutiveLosses),
      highestUnrealized: highestUnrealized === '' ? undefined : Number(highestUnrealized),
      rulesFollowed,
      notes: notes || undefined,
    })
    onClose()
  }

  return (
    <Modal
      title={`Log session — ${account.label}`}
      onClose={onClose}
      minWidth={320}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
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
    </Modal>
  )
}
