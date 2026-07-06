import { useState } from 'react'
import { db, STAGE_OPTIONS, type Account } from '../../../db/schema'
import { Modal } from '../../../shared/ui/Modal'

export function EditAccountDialog({ account, onClose }: { account: Account; onClose: () => void }) {
  const [balance, setBalance] = useState(String(account.balance))
  const [highestBalance, setHighestBalance] = useState(String(account.highestBalance))
  const [stage, setStage] = useState<Account['stage']>(account.stage)
  const [active, setActive] = useState(account.active)
  
  // Custom Risk fields
  const [maxDrawdown, setMaxDrawdown] = useState(account.maxDrawdown !== undefined ? String(account.maxDrawdown) : '')
  const [dailyLossLimit, setDailyLossLimit] = useState(account.dailyLossLimit !== undefined ? String(account.dailyLossLimit) : '')
  const [profitTarget, setProfitTarget] = useState(account.profitTarget !== undefined ? String(account.profitTarget) : '')
  const [trailingDrawdown, setTrailingDrawdown] = useState(!!account.trailingDrawdown)

  async function save() {
    await db.accounts.update(account.id!, {
      balance: Number(balance),
      highestBalance: Number(highestBalance),
      stage,
      active,
      maxDrawdown: maxDrawdown ? Number(maxDrawdown) : undefined,
      dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : undefined,
      profitTarget: profitTarget ? Number(profitTarget) : undefined,
      trailingDrawdown,
    })
    onClose()
  }

  return (
    <Modal
      title={`Edit ${account.label}`}
      onClose={onClose}
      minWidth={360}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </>
      }
    >
      <div className="field-row">
        <label className="flex-1">
          Balance ($)
          <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </label>
        <label className="flex-1">
          Highest Balance ($)
          <input type="number" value={highestBalance} onChange={(e) => setHighestBalance(e.target.value)} />
        </label>
      </div>

      <label className="field">
        Stage
        <select value={stage} onChange={(e) => setStage(e.target.value as Account['stage'])}>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <div style={{ margin: '1rem 0 0.5rem 0', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
        Risk Management &amp; Rules
      </div>

      <div className="field-row">
        <label className="flex-1">
          Max Drawdown ($)
          <input type="number" value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} />
        </label>
        <label className="flex-1">
          Daily Loss Limit ($)
          <input type="number" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
        </label>
      </div>

      <div className="field-row" style={{ alignItems: 'center' }}>
        <label className="flex-1">
          Profit Target ($)
          <input type="number" value={profitTarget} onChange={(e) => setProfitTarget(e.target.value)} />
        </label>
        <label className="flex-1 field-checkbox" style={{ marginTop: '1.25rem' }}>
          <input type="checkbox" checked={trailingDrawdown} onChange={(e) => setTrailingDrawdown(e.target.checked)} />
          Trailing drawdown
        </label>
      </div>

      <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (shown on the Risk Cockpit)
      </label>
    </Modal>
  )
}
