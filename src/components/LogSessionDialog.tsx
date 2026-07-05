import { useState } from 'react'
import type { Account } from '../db/schema'
import { logSession, todayISO } from '../db/sessions'

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
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: 8, padding: '1.5rem', minWidth: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Log session — {account.label}</h3>
        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>{todayISO()}</div>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          P&amp;L
          <input type="number" value={pnl} onChange={(e) => setPnl(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Trades
          <input type="number" value={trades} onChange={(e) => setTrades(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Consecutive losses today
          <input type="number" value={consecutiveLosses} onChange={(e) => setConsecutiveLosses(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Highest unrealized balance (optional)
          <input type="number" value={highestUnrealized} onChange={(e) => setHighestUnrealized(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
          <input type="checkbox" checked={rulesFollowed} onChange={(e) => setRulesFollowed(e.target.checked)} />
          Rules followed
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} />
        </label>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
