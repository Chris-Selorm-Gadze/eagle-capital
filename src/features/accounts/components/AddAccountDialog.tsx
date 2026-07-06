import { useState, useEffect } from 'react'
import { STAGE_OPTIONS, type Account } from '../../../db/schema'
import { addAccount } from '../../../db/accounts'
import { Modal } from '../../../shared/ui/Modal'
import { PROP_FIRMS } from '../propFirms'

function getDefaults(firmId: string, sizeNum: number) {
  if (sizeNum <= 0) return { maxDrawdown: '', dailyLossLimit: '', profitTarget: '', trailingDrawdown: false }
  
  if (firmId === 'fundednext') {
    return {
      maxDrawdown: String(sizeNum * 0.10),
      dailyLossLimit: String(sizeNum * 0.05),
      profitTarget: String(sizeNum * 0.08),
      trailingDrawdown: false
    }
  } else if (firmId === 'apex') {
    let maxDd = sizeNum * 0.05
    let target = sizeNum * 0.06
    if (sizeNum === 250000) { maxDd = 6500; target = 15000; }
    else if (sizeNum === 150000) { maxDd = 5000; target = 9000; }
    else if (sizeNum === 100000) { maxDd = 3000; target = 6000; }
    else if (sizeNum === 50000) { maxDd = 2500; target = 3000; }
    else if (sizeNum === 25000) { maxDd = 1500; target = 1500; }
    return {
      maxDrawdown: String(maxDd),
      dailyLossLimit: '0',
      profitTarget: String(target),
      trailingDrawdown: true
    }
  } else {
    return {
      maxDrawdown: String(sizeNum * 0.10),
      dailyLossLimit: String(sizeNum * 0.05),
      profitTarget: String(sizeNum * 0.10),
      trailingDrawdown: false
    }
  }
}

export function AddAccountDialog({ onClose }: { onClose: () => void }) {
  const [firmId, setFirmId] = useState<string>('fundednext')
  const [customFirmName, setCustomFirmName] = useState('')
  const [label, setLabel] = useState('')
  const [size, setSize] = useState('')
  const [stage, setStage] = useState<Account['stage']>('planned')
  const [active, setActive] = useState(true)
  
  // Custom Risk fields
  const [maxDrawdown, setMaxDrawdown] = useState('')
  const [dailyLossLimit, setDailyLossLimit] = useState('')
  const [profitTarget, setProfitTarget] = useState('')
  const [trailingDrawdown, setTrailingDrawdown] = useState(false)

  // Autocomplete label and limits when size / firmId changes
  useEffect(() => {
    const sizeNum = Number(size)
    if (sizeNum > 0) {
      const selectedFirm = PROP_FIRMS.find((f) => f.id === firmId)
      const firmName = firmId === 'other' ? (customFirmName || 'Custom') : (selectedFirm?.name || '')
      setLabel(`${firmName} ${(sizeNum / 1000).toFixed(0)}K`)
      
      const defaults = getDefaults(firmId, sizeNum)
      setMaxDrawdown(defaults.maxDrawdown)
      setDailyLossLimit(defaults.dailyLossLimit)
      setProfitTarget(defaults.profitTarget)
      setTrailingDrawdown(defaults.trailingDrawdown)
    }
  }, [firmId, size, customFirmName])

  const canSave = label.trim() !== '' && size !== '' && Number(size) > 0

  async function save() {
    const sizeNum = Number(size)
    await addAccount({
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
    })
    onClose()
  }

  return (
    <Modal
      title="Add account"
      onClose={onClose}
      minWidth={400}
      footer={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={!canSave}>Add account</button>
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
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="FN 50K" />
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

      <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (shown on the Risk Cockpit right away)
      </label>
    </Modal>
  )
}
