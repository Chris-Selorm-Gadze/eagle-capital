import { useState, type ReactNode } from 'react'
import { usePostHog } from '@posthog/react'
import { STAGE_OPTIONS, type Account } from '../../../db/schema'
import { addAccount } from '../../../db/accounts'
import { addBrokerConnection, linkAccount, deleteBrokerConnection } from '../../../db/brokerConnections'
import { linkSubAccount } from '../../../db/brokerConnectionAccounts'
import { brokerSyncConfigured, submitMetaApiCredentials, submitTradovateCredentials, type LiveAccountInfo, type TradovateFetchedAccount } from '../../../lib/brokerSyncClient'
import { Modal } from '../../../shared/ui/Modal'
import { MetaApiCredentialFields } from '../../brokers/MetaApiCredentialFields'
import { BROKERS } from '../../brokers/brokerCatalog'
import { PROP_FIRMS } from '../propFirms'
import { errorMessage } from '../../../utils/errors'
import styles from './AccountDialogs.module.css'

// 'live' is only ever reached via the top-level kind picker below, never from within the
// prop-firm dialog's own Stage dropdown — keeps the two flows from overlapping.
const PROP_FIRM_STAGE_OPTIONS = STAGE_OPTIONS.filter((s) => s !== 'live')

const FUTURES_BROKERS = BROKERS.filter((b) => b.assetClass === 'futures')

type Kind = 'unset' | 'live' | 'prop'
// CFD (MT4/5-style) needs login+password+server; futures brokers (Tradovate, Topstep, Rithmic)
// authenticate with just login+password and can expose several real accounts under one login —
// see the futures branch below for the account picker that comes out of that.
type LiveCategory = 'unset' | 'futures' | 'cfd'

export function AddAccountDialog({
  userId,
  onClose,
  onSaved,
  forceKind,
}: {
  userId: string
  onClose: () => void
  onSaved: () => void
  // Skips the live-vs-prop-firm choice screen entirely — e.g. opened from Prop Firm Management,
  // where the context already implies "prop firm account" and there's no need to ask.
  forceKind?: 'live' | 'prop'
}) {
  const posthog = usePostHog()
  const [kind, setKind] = useState<Kind>(forceKind ?? 'unset')
  const [liveCategory, setLiveCategory] = useState<LiveCategory>('unset')

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

  // Futures (Tradovate, Topstep, Rithmic): just login + password, no server field — and unlike
  // MT5, one login can expose several real accounts, so verifying returns a list to pick from
  // rather than a single reviewable account. deviceId is a real Tradovate API requirement (any
  // stable identifier), not something meaningful to the user, so it's derived rather than asked.
  const [futuresBrokerId, setFuturesBrokerId] = useState(FUTURES_BROKERS[0]?.id ?? '')
  const [futuresName, setFuturesName] = useState('')
  const [futuresPassword, setFuturesPassword] = useState('')
  const [futuresConnectionId, setFuturesConnectionId] = useState<string | null>(null)
  const [futuresAccounts, setFuturesAccounts] = useState<TradovateFetchedAccount[] | null>(null)
  const [selectedFuturesExternalId, setSelectedFuturesExternalId] = useState<number | null>(null)
  const [futuresLabel, setFuturesLabel] = useState('')
  const canVerifyFutures = futuresName.trim() !== '' && futuresPassword !== ''
  const selectedFuturesAccount = futuresAccounts?.find((a) => a.externalId === selectedFuturesExternalId) ?? null

  async function verifyFuturesAccount() {
    setError(null)
    setVerifying(true)
    let connectionId: string | null = null
    try {
      connectionId = await addBrokerConnection(userId, futuresBrokerId, `Live account — ${futuresName.trim()}`)
      const result = await submitTradovateCredentials(connectionId, {
        name: futuresName.trim(),
        password: futuresPassword,
        deviceId: `eaglecapital-${userId.slice(0, 8)}`,
      })
      if (result.status !== 'connected' || !result.accounts || result.accounts.length === 0) {
        throw new Error(result.error ?? 'Could not find any accounts for these credentials.')
      }
      setFuturesConnectionId(connectionId)
      setFuturesAccounts(result.accounts)
      setSelectedFuturesExternalId(result.accounts[0].externalId)
      setFuturesLabel(result.accounts[0].name)
    } catch (err) {
      if (connectionId) await deleteBrokerConnection(connectionId).catch(() => {})
      setError(errorMessage(err))
    } finally {
      setVerifying(false)
    }
  }

  async function startOverFuturesAccount() {
    if (futuresConnectionId) await deleteBrokerConnection(futuresConnectionId).catch(() => {})
    setFuturesConnectionId(null)
    setFuturesAccounts(null)
    setSelectedFuturesExternalId(null)
    setFuturesLabel('')
  }

  // Back to the live-vs-prop-firm choice — cleans up any pending connection from either live path.
  async function backToKindChoice() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    if (futuresConnectionId) await deleteBrokerConnection(futuresConnectionId).catch(() => {})
    setLiveConnectionId(null)
    setLiveInfo(null)
    setLiveLabel('')
    setLiveLogin('')
    setLivePassword('')
    setLiveServer('')
    setFuturesConnectionId(null)
    setFuturesAccounts(null)
    setSelectedFuturesExternalId(null)
    setFuturesLabel('')
    setFuturesName('')
    setFuturesPassword('')
    setLiveCategory('unset')
    setError(null)
    setKind('unset')
  }

  // Back to the futures-vs-CFD choice, one level short of the live-vs-prop-firm choice above.
  async function backToCategoryChoice() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    if (futuresConnectionId) await deleteBrokerConnection(futuresConnectionId).catch(() => {})
    setLiveConnectionId(null)
    setLiveInfo(null)
    setLiveLabel('')
    setLiveLogin('')
    setLivePassword('')
    setLiveServer('')
    setFuturesConnectionId(null)
    setFuturesAccounts(null)
    setSelectedFuturesExternalId(null)
    setFuturesLabel('')
    setFuturesName('')
    setFuturesPassword('')
    setError(null)
    setLiveCategory('unset')
  }

  // A connection can exist (verified) but not yet be saved as an account — closing the dialog at
  // that point (via Cancel or clicking the backdrop) must not leave it orphaned.
  async function handleAbandon() {
    if (liveConnectionId) await deleteBrokerConnection(liveConnectionId).catch(() => {})
    if (futuresConnectionId) await deleteBrokerConnection(futuresConnectionId).catch(() => {})
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
      posthog?.capture('account_created', { account_kind: 'live', account_category: 'cfd' })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveFuturesAccount() {
    if (!selectedFuturesAccount || !futuresConnectionId) return
    setError(null)
    setSaving(true)
    try {
      const balance = selectedFuturesAccount.balance ?? 0
      const accountId = await addAccount(userId, {
        label: futuresLabel.trim() || selectedFuturesAccount.name,
        size: balance,
        balance,
        highestBalance: balance,
        stage: 'live',
        active,
      })
      await linkSubAccount(userId, futuresConnectionId, accountId, String(selectedFuturesAccount.externalId), selectedFuturesAccount.name)
      posthog?.capture('account_created', { account_kind: 'live', account_category: 'futures' })
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
      posthog?.capture('account_created', {
        account_kind: 'prop',
        account_size: sizeNum,
        account_stage: stage,
        firm_id: firmId,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  // No choice screen to return to when the caller already forced a kind (e.g. Prop Firm
  // Management's "+ Add Account" implies prop-firm) — "Back" becomes a plain "Cancel" instead.
  const backButton = forceKind
    ? <button onClick={handleAbandon} className="btn-ghost">Cancel</button>
    : <button onClick={backToKindChoice} className="btn-ghost">Back</button>

  const categoryBackButton = <button onClick={backToCategoryChoice} className="btn-ghost">Back</button>

  let footer: ReactNode
  if (kind === 'unset') {
    footer = <button onClick={onClose} className="btn-ghost">Cancel</button>
  } else if (kind === 'live') {
    if (liveCategory === 'unset') {
      footer = backButton
    } else if (liveCategory === 'cfd') {
      footer = liveInfo ? (
        <>
          <button onClick={startOverLiveAccount} className="btn-ghost">Start over</button>
          <button onClick={saveLiveAccount} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save account'}</button>
        </>
      ) : (
        <>
          {categoryBackButton}
          <button onClick={verifyLiveAccount} disabled={!canVerify || verifying || !brokerSyncConfigured} className="btn-primary">
            {verifying ? 'Verifying…' : 'Verify & continue'}
          </button>
        </>
      )
    } else {
      footer = futuresAccounts ? (
        <>
          <button onClick={startOverFuturesAccount} className="btn-ghost">Start over</button>
          <button onClick={saveFuturesAccount} disabled={saving || !selectedFuturesAccount} className="btn-primary">{saving ? 'Saving…' : 'Save account'}</button>
        </>
      ) : (
        <>
          {categoryBackButton}
          <button onClick={verifyFuturesAccount} disabled={!canVerifyFutures || verifying || !brokerSyncConfigured} className="btn-primary">
            {verifying ? 'Verifying…' : 'Verify & continue'}
          </button>
        </>
      )
    }
  } else {
    footer = (
      <>
        {backButton}
        <button onClick={save} disabled={!canSave || saving} className="btn-primary">{saving ? 'Adding…' : 'Add account'}</button>
      </>
    )
  }

  return (
    <Modal title="Add account" onClose={handleAbandon} minWidth={kind === 'prop' ? 560 : 400} footer={footer}>
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

      {kind === 'live' && !brokerSyncConfigured && (
        <p style={{ color: 'var(--text-muted)' }}>
          Broker sync isn't configured yet — set VITE_BROKER_SYNC_API_URL in .env.local to connect a live account.
        </p>
      )}

      {kind === 'live' && brokerSyncConfigured && liveCategory === 'unset' && (
        <div className={styles.kindChoice}>
          <button className={styles.kindOption} onClick={() => setLiveCategory('futures')}>
            <div className={styles.kindTitle}>Futures</div>
            <div className={styles.kindDesc}>Tradovate, Topstep, Rithmic, and similar — just a login and password, no server to enter.</div>
          </button>
          <button className={styles.kindOption} onClick={() => setLiveCategory('cfd')}>
            <div className={styles.kindTitle}>CFD / MetaTrader</div>
            <div className={styles.kindDesc}>MT4/MT5-style accounts — needs your login, password, and the broker's server name.</div>
          </button>
        </div>
      )}

      {kind === 'live' && brokerSyncConfigured && liveCategory === 'cfd' && (
        liveInfo ? (
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
              Show in main portfolio (uncheck to file under Inactive accounts instead)
            </label>
          </>
        ) : (
          <MetaApiCredentialFields login={liveLogin} setLogin={setLiveLogin} password={livePassword} setPassword={setLivePassword} server={liveServer} setServer={setLiveServer} />
        )
      )}

      {kind === 'live' && brokerSyncConfigured && liveCategory === 'futures' && (
        futuresAccounts ? (
          <>
            <label className="field">
              Label
              <input value={futuresLabel} onChange={(e) => setFuturesLabel(e.target.value)} placeholder={selectedFuturesAccount?.name} />
            </label>

            {futuresAccounts.length > 1 && (
              <label className="field">
                Account
                <select value={selectedFuturesExternalId ?? ''} onChange={(e) => setSelectedFuturesExternalId(Number(e.target.value))}>
                  {futuresAccounts.map((a) => (
                    <option key={a.externalId} value={a.externalId}>
                      {a.name}{a.balance !== null ? ` — $${a.balance.toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedFuturesAccount && (
              <>
                <div className={styles.sectionDivider}>Fetched from {BROKERS.find((b) => b.id === futuresBrokerId)?.name ?? futuresBrokerId}</div>
                <div className="field-row">
                  <label className="flex-1">
                    Balance
                    <input value={selectedFuturesAccount.balance !== null ? `$${selectedFuturesAccount.balance.toLocaleString()}` : 'Unknown'} disabled />
                  </label>
                  <label className="flex-1">
                    Account type
                    <input value={selectedFuturesAccount.accountType} disabled />
                  </label>
                </div>
                {!selectedFuturesAccount.active && (
                  <p style={{ color: 'var(--warning)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    This account is flagged inactive by the broker — just flagging in case that's unexpected.
                  </p>
                )}
              </>
            )}

            <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Show in main portfolio (uncheck to file under Inactive accounts instead)
            </label>
          </>
        ) : (
          <>
            <label className="field">
              Broker
              <select value={futuresBrokerId} onChange={(e) => setFuturesBrokerId(e.target.value)}>
                {FUTURES_BROKERS.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Username
              <input value={futuresName} onChange={(e) => setFuturesName(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              Password
              <input type="password" value={futuresPassword} onChange={(e) => setFuturesPassword(e.target.value)} autoComplete="off" />
            </label>
          </>
        )
      )}

      {kind === 'prop' && (
        <>
          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>Account Details</div>
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

            <div className="field-row">
              <label className="flex-1">
                Label
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. FTMO 100K #1" />
              </label>
              <label className="flex-1">
                Stage
                <select value={stage} onChange={(e) => setStage(e.target.value as Account['stage'])}>
                  {PROP_FIRM_STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>Risk Management &amp; Limits</div>

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
              <label className="flex-1 field-checkbox" style={{ marginTop: '1.6rem' }}>
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
          </div>

          <label className="field-checkbox" style={{ marginTop: '1.5rem' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Show in main portfolio (uncheck to file under Inactive accounts instead)
          </label>
        </>
      )}

      {error && <div style={{ color: 'var(--critical)', marginTop: '1rem' }}>{error}</div>}
    </Modal>
  )
}
