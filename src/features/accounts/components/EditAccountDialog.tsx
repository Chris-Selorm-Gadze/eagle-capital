import { useState } from 'react'
import { STAGE_OPTIONS, type Account } from '../../../db/schema'
import type { AccountLedger } from '../../../utils/ledger'
import { updateAccount, deleteAccount } from '../../../db/accounts'
import { Modal } from '../../../shared/ui/Modal'
import { BREACH_REASONS } from '../breachReasons'
import { errorMessage } from '../../../utils/errors'
import styles from './AccountDialogs.module.css'
import { useConfirm } from '../../../shared/ui/confirm'

export function EditAccountDialog({
  account,
  ledger,
  onClose,
  onSaved,
}: {
  account: Account
  /** Derived balance/peak, shown read-only. */
  ledger?: AccountLedger
  onClose: () => void
  onSaved: () => void
}) {
  const confirm = useConfirm()
  // Starting size is the one capital figure a user can set. Current balance and
  // peak used to be editable text inputs writing straight to `accounts.balance`
  // / `highest_balance`; both are derived from trades, sessions and payouts now
  // (utils/ledger.ts), so an input for them would be a field that silently
  // reverts the moment anything is logged.
  const [size, setSize] = useState(String(account.size))
  const [stage, setStage] = useState<Account['stage']>(account.stage)
  const [active, setActive] = useState(account.active)
  const [blownReason, setBlownReason] = useState(account.blownReason ?? '')

  // Custom Risk fields
  const [maxDrawdown, setMaxDrawdown] = useState(account.maxDrawdown !== undefined ? String(account.maxDrawdown) : '')
  const [dailyLossLimit, setDailyLossLimit] = useState(account.dailyLossLimit !== undefined ? String(account.dailyLossLimit) : '')
  const [profitTarget, setProfitTarget] = useState(account.profitTarget !== undefined ? String(account.profitTarget) : '')
  const [trailingDrawdown, setTrailingDrawdown] = useState(!!account.trailingDrawdown)
  const [minTradingDays, setMinTradingDays] = useState(account.minTradingDays !== undefined ? String(account.minTradingDays) : '')
  const [cost, setCost] = useState(account.cost !== undefined ? String(account.cost) : '')

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLive = stage === 'live'

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await updateAccount(account.id!, {
        size: Number(size),
        stage,
        active,
        maxDrawdown: !isLive && maxDrawdown ? Number(maxDrawdown) : undefined,
        dailyLossLimit: !isLive && dailyLossLimit ? Number(dailyLossLimit) : undefined,
        profitTarget: !isLive && profitTarget ? Number(profitTarget) : undefined,
        trailingDrawdown: !isLive && trailingDrawdown,
        minTradingDays: !isLive && minTradingDays ? Number(minTradingDays) : undefined,
        cost: !isLive && cost ? Number(cost) : undefined,
        blownReason: stage === 'blown' ? (blownReason || undefined) : undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!(await confirm({ title: `Delete ${account.label}?`, description: 'This also deletes all sessions, trades, payouts and rewards logged against it. This cannot be undone.', confirmLabel: 'Delete account', destructive: true }))) return
    setError(null)
    setDeleting(true)
    try {
      await deleteAccount(account.id!)
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setDeleting(false)
    }
  }

  return (
    <Modal
      title={`Edit ${account.label}`}
      onClose={onClose}
      minWidth={360}
      footer={
        <>
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="btn-ghost"
            style={{ color: 'var(--critical)', marginRight: 'auto' }}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving || deleting} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <label className="field">
        Starting size ($)
        <input type="number" value={size} onChange={(e) => setSize(e.target.value)} />
      </label>

      <div className={styles.derivedRow}>
        <div>
          <div className={styles.derivedLabel}>Current balance</div>
          <div className={styles.derivedValue}>${(ledger?.balance ?? account.size).toLocaleString()}</div>
        </div>
        <div>
          <div className={styles.derivedLabel}>Peak balance</div>
          <div className={styles.derivedValue}>${(ledger?.peakBalance ?? account.size).toLocaleString()}</div>
        </div>
        <p className={styles.derivedHint}>
          Calculated from your logged trades, sessions and payouts — correct those to change these.
        </p>
      </div>

      <label className="field">
        Stage
        <select value={stage} onChange={(e) => setStage(e.target.value as Account['stage'])}>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      {stage === 'blown' && (
        <label className="field">
          Reason
          <select value={blownReason} onChange={(e) => setBlownReason(e.target.value)}>
            <option value="">— select a reason —</option>
            {BREACH_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      )}

      {!isLive && (
        <>
          <div className={styles.sectionDivider}>Risk Management &amp; Rules</div>

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

          <div className="field-row">
            <label className="flex-1">
              Min Trading Days
              <input type="number" value={minTradingDays} onChange={(e) => setMinTradingDays(e.target.value)} />
            </label>
            <label className="flex-1">
              Challenge Cost ($)
              <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </label>
          </div>
        </>
      )}

      <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Show in main portfolio (uncheck to file under Inactive accounts instead)
      </label>

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
