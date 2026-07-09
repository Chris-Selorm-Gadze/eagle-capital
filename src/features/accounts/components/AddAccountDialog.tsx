import { useState } from 'react'
import { STAGE_OPTIONS, type Account } from '../../../db/schema'
import { addAccount } from '../../../db/accounts'
import { Modal } from '../../../shared/ui/Modal'
import { PROP_FIRMS } from '../propFirms'
import { errorMessage } from '../../../utils/errors'

export function AddAccountDialog({
  userId,
  onClose,
  onSaved,
}: {
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [firmId, setFirmId] = useState<string>(PROP_FIRMS[0].id)
  const [customFirmName, setCustomFirmName] = useState('')
  const [label, setLabel] = useState('')
  const [size, setSize] = useState('')
  const [stage, setStage] = useState<Account['stage']>('planned')
  const [active, setActive] = useState(true)

  // Custom Risk fields — no auto-filled defaults; every firm has its own rules, so these are typed in by hand
  const [maxDrawdown, setMaxDrawdown] = useState('')
  const [dailyLossLimit, setDailyLossLimit] = useState('')
  const [profitTarget, setProfitTarget] = useState('')
  const [trailingDrawdown, setTrailingDrawdown] = useState(false)
  const [minTradingDays, setMinTradingDays] = useState('')
  const [cost, setCost] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = label.trim() !== '' && size !== '' && Number(size) > 0

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const sizeNum = Number(size)
      await addAccount(userId, {
        firmId,
        customFirmName: firmId === 'other' ? customFirmName : undefined,
        label: label.trim(),
        size: sizeNum,
        stage,
        active,
        maxDrawdown: maxDrawdown ? Number(maxDrawdown) : undefined,
        dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : undefined,
        profitTarget: profitTarget ? Number(profitTarget) : undefined,
        trailingDrawdown,
        minTradingDays: minTradingDays ? Number(minTradingDays) : undefined,
        cost: cost ? Number(cost) : undefined,
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
      title="Add account"
      onClose={onClose}
      minWidth={400}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={!canSave || saving}>{saving ? 'Adding…' : 'Add account'}</button>
        </>
      }
    >
      <div className="field-row">
        <label className="flex-1">
          Firm
          <select value={firmId} onChange={(e) => setFirmId(e.target.value)}>
            {PROP_FIRMS.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          Size ($)
          <input type="number" value={size} onChange={(e) => setSize(e.target.value)} placeholder="50000" />
        </label>
      </div>

      {firmId === 'other' && (
        <label className="field">
          Custom Firm Name
          <input value={customFirmName} onChange={(e) => setCustomFirmName(e.target.value)} placeholder="My Niche Firm" />
        </label>
      )}

      <label className="field">
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. FTMO 100K #1" />
      </label>

      <label className="field">
        Stage
        <select value={stage} onChange={(e) => setStage(e.target.value as Account['stage'])}>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      <div style={{ margin: '1rem 0 0.5rem 0', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
        Risk Management &amp; Limits
      </div>

      <div className="field-row">
        <label className="flex-1">
          Max Drawdown ($)
          <input type="number" value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} placeholder="e.g. 5000" />
        </label>
        <label className="flex-1">
          Daily Loss Limit ($)
          <input type="number" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} placeholder="e.g. 2500" />
        </label>
      </div>

      <div className="field-row" style={{ alignItems: 'center' }}>
        <label className="flex-1">
          Profit Target ($)
          <input type="number" value={profitTarget} onChange={(e) => setProfitTarget(e.target.value)} placeholder="e.g. 4000" />
        </label>
        <label className="flex-1 field-checkbox" style={{ marginTop: '1.25rem' }}>
          <input type="checkbox" checked={trailingDrawdown} onChange={(e) => setTrailingDrawdown(e.target.checked)} />
          Trailing drawdown
        </label>
      </div>

      <div className="field-row">
        <label className="flex-1">
          Min Trading Days
          <input type="number" value={minTradingDays} onChange={(e) => setMinTradingDays(e.target.value)} placeholder="e.g. 10" />
        </label>
        <label className="flex-1">
          Challenge Cost ($)
          <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 150" />
        </label>
      </div>

      <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (shown on the Risk Cockpit right away)
      </label>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
