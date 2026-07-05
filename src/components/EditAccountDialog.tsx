import { useState } from 'react'
import { db, type Account } from '../db/schema'

const STAGE_OPTIONS: Account['stage'][] = ['challenge', 'phase2', 'funded', 'evaluation', 'pa', 'planned', 'blown']

export function EditAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [balance, setBalance] = useState(String(account.balance))
  const [highestBalance, setHighestBalance] = useState(String(account.highestBalance))
  const [stage, setStage] = useState<Account['stage']>(account.stage)

  async function save() {
    await db.accounts.update(account.id!, {
      balance: Number(balance),
      highestBalance: Number(highestBalance),
      stage,
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
        <h3 style={{ marginTop: 0 }}>Edit {account.label}</h3>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Balance
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Highest balance
          <input
            type="number"
            value={highestBalance}
            onChange={(e) => setHighestBalance(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Stage
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as Account['stage'])}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
