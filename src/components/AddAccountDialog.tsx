import { useState } from 'react'
import { STAGE_OPTIONS, type Account } from '../db/schema'
import { addAccount } from '../db/accounts'
import type { FnModel } from '../domain/fundednext'

const FN_MODELS: FnModel[] = ['stellar-1step', 'stellar-2step', 'stellar-lite']

export function AddAccountDialog({ onClose }: { onClose: () => void }) {
  const [firm, setFirm] = useState<Account['firm']>('fundednext')
  const [label, setLabel] = useState('')
  const [size, setSize] = useState('')
  const [stage, setStage] = useState<Account['stage']>('planned')
  const [model, setModel] = useState<FnModel>('stellar-1step')
  const [platform, setPlatform] = useState<'rithmic' | 'tradovate'>('rithmic')
  const [active, setActive] = useState(true)

  const canSave = label.trim() !== '' && size !== '' && Number(size) > 0

  async function save() {
    await addAccount({
      firm,
      label: label.trim(),
      size: Number(size),
      stage,
      active,
      ...(firm === 'fundednext' ? { model } : { platform }),
    })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1.5rem', minWidth: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Add account</h3>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <label style={{ flex: 1 }}>
            Firm
            <select
              value={firm}
              onChange={(e) => setFirm(e.target.value as Account['firm'])}
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            >
              <option value="fundednext">FundedNext</option>
              <option value="apex">Apex</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Size
            <input
              type="number" value={size} onChange={(e) => setSize(e.target.value)} placeholder="50000"
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </div>

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          Label
          <input
            value={label} onChange={(e) => setLabel(e.target.value)} placeholder="FN 50K"
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <label style={{ flex: 1 }}>
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
          {firm === 'fundednext' ? (
            <label style={{ flex: 1 }}>
              Model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as FnModel)}
                style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
              >
                {FN_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          ) : (
            <label style={{ flex: 1 }}>
              Platform
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'rithmic' | 'tradovate')}
                style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
              >
                <option value="rithmic">Rithmic</option>
                <option value="tradovate">Tradovate</option>
              </select>
            </label>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active (shown on the Risk Cockpit right away)
        </label>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={!canSave}>Add account</button>
        </div>
      </div>
    </div>
  )
}
