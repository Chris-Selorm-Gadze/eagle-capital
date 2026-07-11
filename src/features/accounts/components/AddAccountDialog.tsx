import { useState, type ReactNode } from 'react'
import { STAGE_OPTIONS, type Account } from '../../../db/schema'
import { addAccount } from '../../../db/accounts'
import { addBrokerConnection, linkAccount, deleteBrokerConnection } from '../../../db/brokerConnections'
import { brokerSyncConfigured, submitMetaApiCredentials, type LiveAccountInfo } from '../../../lib/brokerSyncClient'
import { Modal } from '../../../shared/ui/Modal'
import { MetaApiCredentialFields } from '../../brokers/MetaApiCredentialFields'
import { PROP_FIRMS } from '../propFirms'
import { errorMessage } from '../../../utils/errors'
import styles from './AccountDialogs.module.css'

// 'live' is only ever reached via the top-level kind picker below, never from within the
// prop-firm dialog's own Stage dropdown — keeps the two flows from overlapping.
const PROP_FIRM_STAGE_OPTIONS = STAGE_OPTIONS.filter((s) => s !== 'live')

type Kind = 'unset' | 'live' | 'prop'

export function AddAccountDialog({
  userId,
  onClose,
  onSaved,
}: {
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState<Kind>('unset')

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

  // Live account: verify real MT5 credentials first, then review real fetched data before saving
  // — no typing in a balance/label that the broker already told us.
  const [liveLogin, setLiveLogin] = useState('')
  const [livePassword, setLivePassword] = useState('')
  const [liveServer, setLiveServer] = useState('')
  const [liveConnectionId, setLiveConnectionId] = useState<string | null>(null)
  const [liveInfo, setLiveInfo] = useState<LiveAccountInfo | null>(null)
  const [liveLabel, setLiveLabel] = useState('')
  const [verifying, setVerifying] = useState(false)
  const canVerify = liveLogin.trim() !== '' && livePassword !== '' && liveServer.trim() !== ''

  async function verifyLiveAccount() {
    setError(null)
    setVerifying(true)
    let connectionId: string | null = null
    try {
      connectionId = await addBrokerConnection(userId, 'mt5', `Live account — ${liveLogin.trim()}`)
      const result = await submitMetaApiCredentials(connectionId, { login: liveLogin.trim(), password: livePassword, server: liveServer.trim() })
      if (result.status !== 'connected' || !result.info) throw new Error(result.error ?? 'Could not verify these credentials.')
      setLiveConnectionId(connectionId)
      setLiveInfo(result.info)
      setLiveLabel(`${result.info.broker} ${result.info.login}`)
    } catch (err) {
      if (connectionId) await deleteBrokerConnection(connectionId).catch(() => {})
      setError(errorMessage(err))
    } finally {
      setVerifying(false)
    }
  }

  // Un-does verification (deletes the connection created to test the credentials) without
  // closing the dialog — lets the user fix a wrong login/server and try again.
  async function startOverLiveAccount() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    setLiveConnectionId(null)
    setLiveInfo(null)
    setLiveLabel('')
  }

  // Back to the initial live-vs-prop-firm choice — cleans up any pending connection first.
  async function backToKindChoice() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    setLiveConnectionId(null)
    setLiveInfo(null)
    setLiveLabel('')
    setLiveLogin('')
    setLivePassword('')
    setLiveServer('')
    setError(null)
    setKind('unset')
  }

  // A connection can exist (verified) but not yet be saved as an account — closing the dialog at
  // that point (via Cancel or clicking the backdrop) must not leave it orphaned.
  async function handleAbandon() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    onClose()
  }

  async function saveLiveAccount() {
    if (!liveInfo || !liveConnectionId) return
    setError(null)
    setSaving(true)
    try {
      const accountId = await addAccount(userId, {
        label: liveLabel.trim() || `${liveInfo.broker} ${liveInfo.login}`,
        size: liveInfo.balance,
        balance: liveInfo.balance,
        highestBalance: liveInfo.balance,
        currency: liveInfo.currency,
        accountNumber: String(liveInfo.login),
        stage: 'live',
        active,
      })
      await linkAccount(liveConnectionId, accountId)
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

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

  let footer: ReactNode
  if (kind === 'unset') {
    footer = <button onClick={onClose} className="btn-ghost">Cancel</button>
  } else if (kind === 'live') {
    footer = liveInfo ? (
      <>
        <button onClick={startOverLiveAccount} className="btn-ghost">Start over</button>
        <button onClick={saveLiveAccount} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save account'}</button>
      </>
    ) : (
      <>
        <button onClick={backToKindChoice} className="btn-ghost">Back</button>
        <button onClick={verifyLiveAccount} disabled={!canVerify || verifying || !brokerSyncConfigured} className="btn-primary">
          {verifying ? 'Verifying…' : 'Verify & continue'}
        </button>
      </>
    )
  } else {
    footer = (
      <>
        <button onClick={backToKindChoice} className="btn-ghost">Back</button>
        <button onClick={save} disabled={!canSave || saving} className="btn-primary">{saving ? 'Adding…' : 'Add account'}</button>
      </>
    )
  }

  return (
    <Modal title="Add account" onClose={handleAbandon} minWidth={400} footer={footer}>
      {kind === 'unset' && (
        <div className={styles.kindChoice}>
          <button className={styles.kindOption} onClick={() => setKind('live')}>
            <div className={styles.kindTitle}>Live account</div>
            <div className={styles.kindDesc}>A real broker account you trade on — connect it and we pull balance, currency, and login straight from the broker. No prop-firm rules.</div>
          </button>
          <button className={styles.kindOption} onClick={() => setKind('prop')}>
            <div className={styles.kindTitle}>Prop firm account</div>
            <div className={styles.kindDesc}>A challenge, evaluation, or funded account under a prop firm's rules — track firm, stage, drawdown limits, and payouts manually.</div>
          </button>
        </div>
      )}

      {kind === 'live' && (
        !brokerSyncConfigured ? (
          <p style={{ color: 'var(--text-muted)' }}>
            Broker sync isn't configured yet — set VITE_BROKER_SYNC_API_URL in .env.local to connect a live account.
          </p>
        ) : liveInfo ? (
          <>
            <label className="field">
              Label
              <input value={liveLabel} onChange={(e) => setLiveLabel(e.target.value)} placeholder={`${liveInfo.broker} ${liveInfo.login}`} />
            </label>
            <div className={styles.sectionDivider}>Fetched from {liveInfo.broker}</div>
            <div className="field-row">
              <label className="flex-1">
                Balance
                <input value={`${liveInfo.balance.toLocaleString()} ${liveInfo.currency}`} disabled />
              </label>
              <label className="flex-1">
                Login
                <input value={String(liveInfo.login)} disabled />
              </label>
            </div>
            <div className="field-row">
              <label className="flex-1">
                Server
                <input value={liveInfo.server} disabled />
              </label>
              <label className="flex-1">
                Account type
                <input value={liveInfo.accountType === 'demo' ? 'Demo' : liveInfo.accountType === 'real' ? 'Real money' : 'Contest'} disabled />
              </label>
            </div>
            {liveInfo.accountType === 'demo' && (
              <p style={{ color: 'var(--warning)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                This is a demo account, not real money — just flagging in case that's unexpected.
              </p>
            )}
            <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (shown on the Risk Cockpit right away)
            </label>
          </>
        ) : (
          <MetaApiCredentialFields login={liveLogin} setLogin={setLiveLogin} password={livePassword} setPassword={setLivePassword} server={liveServer} setServer={setLiveServer} />
        )
      )}

      {kind === 'prop' && (
        <>
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
              {PROP_FIRM_STAGE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <div className={styles.sectionDivider}>Risk Management &amp; Limits</div>

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
        </>
      )}

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
