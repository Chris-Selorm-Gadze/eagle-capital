import { useEffect, useState } from 'react'
import {
  deltaEngineConfigured,
  listAccounts, listCopiers, createCopier, enableCopier, disableCopier, deleteCopier,
  listRiskProfiles, unlockRiskProfile, flattenPositions,
  type DeltaAccount, type DeltaCopier, type DeltaRiskProfile, type RiskMode,
} from '../../lib/deltaEngineClient'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import styles from './TradeCopierPage.module.css'

function accountLabel(accounts: DeltaAccount[], id: string): string {
  const a = accounts.find((x) => x.id === id)
  return a ? (a.account_label || `${a.platform} · ${a.account_number}`) : id
}

function TradeCopierWorkspace() {
  const [accounts, setAccounts] = useState<DeltaAccount[]>([])
  const [copiers, setCopiers] = useState<DeltaCopier[]>([])
  const [riskProfiles, setRiskProfiles] = useState<DeltaRiskProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [masterId, setMasterId] = useState('')
  const [followerId, setFollowerId] = useState('')
  const [label, setLabel] = useState('')
  const [riskMode, setRiskMode] = useState<RiskMode>('multiplier')
  const [multiplier, setMultiplier] = useState('1.0')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [a, c, r] = await Promise.all([listAccounts(), listCopiers(), listRiskProfiles()])
      setAccounts(a.accounts)
      setCopiers(c.copiers)
      setRiskProfiles(r.profiles)
      if (!masterId && a.accounts[0]) setMasterId(a.accounts[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreateCopier() {
    if (!masterId || !followerId || masterId === followerId) return
    setError(null)
    try {
      await createCopier({
        master_account_id: masterId,
        follower_account_id: followerId,
        label: label.trim() || undefined,
        risk_mode: riskMode,
        multiplier: Number(multiplier),
      })
      setLabel('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleToggle(c: DeltaCopier) {
    if (!c.is_enabled && !window.confirm(`Enable copying from ${accountLabel(accounts, c.master_account_id)} to ${accountLabel(accounts, c.follower_account_id)}? This mirrors real orders immediately.`)) {
      return
    }
    setError(null)
    try {
      await (c.is_enabled ? disableCopier(c.id) : enableCopier(c.id))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(c: DeltaCopier) {
    if (!window.confirm('Delete this copier relation?')) return
    setError(null)
    try {
      await deleteCopier(c.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleUnlock(p: DeltaRiskProfile) {
    setError(null)
    try {
      await unlockRiskProfile(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleFlatten(p: DeltaRiskProfile) {
    if (!window.confirm(`Flatten all open positions on ${accountLabel(accounts, p.account_id)}? This closes real positions immediately.`)) return
    setError(null)
    try {
      await flattenPositions(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.section}>
        <h2>Accounts</h2>
        {accounts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No accounts on Delta Engine yet.</p>
        ) : (
          <div className={`card ${styles.list}`}>
            {accounts.map((a) => (
              <div key={a.id} className={styles.row}>
                <span className={styles.cell}>{a.account_label || `${a.platform} · ${a.account_number}`}</span>
                <span className={styles.cellMuted}>{a.platform}</span>
                <span className={styles.cellMuted}>{a.connection_status}</span>
                <span className={styles.cellMuted}>{a.balance !== null ? `$${a.balance.toLocaleString()}` : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2>Copier relations</h2>
        {copiers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No copier relations yet.</p>
        ) : (
          <div className={`card ${styles.list}`}>
            {copiers.map((c) => (
              <div key={c.id} className={styles.row}>
                <span className={styles.cell}>
                  {accountLabel(accounts, c.master_account_id)} → {accountLabel(accounts, c.follower_account_id)}
                  {c.label ? ` · ${c.label}` : ''}
                </span>
                <span className={styles.cellMuted}>{c.risk_mode} × {c.multiplier}</span>
                <span className={c.is_enabled ? styles.badgeOn : styles.badgeOff}>{c.is_enabled ? 'enabled' : 'disabled'}</span>
                <button onClick={() => handleToggle(c)}>{c.is_enabled ? 'Disable' : 'Enable'}</button>
                <button onClick={() => handleDelete(c)} className="btn-ghost">Delete</button>
              </div>
            ))}
          </div>
        )}

        <div className={`card ${styles.addRow}`}>
          <label className="flex-1">Master
            <select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_label || a.account_number}</option>)}
            </select>
          </label>
          <label className="flex-1">Follower
            <select value={followerId} onChange={(e) => setFollowerId(e.target.value)}>
              <option value="">Select…</option>
              {accounts.filter((a) => a.id !== masterId).map((a) => <option key={a.id} value={a.id}>{a.account_label || a.account_number}</option>)}
            </select>
          </label>
          <label className="flex-1">Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex-1">Risk mode
            <select value={riskMode} onChange={(e) => setRiskMode(e.target.value as RiskMode)}>
              <option value="multiplier">Multiplier</option>
              <option value="fixed_lot">Fixed lot</option>
              <option value="equity_ratio">Equity ratio</option>
              <option value="risk_percent">Risk percent</option>
            </select>
          </label>
          <label className="flex-1">Multiplier
            <input type="number" step="0.01" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={handleCreateCopier} disabled={!masterId || !followerId}>Add copier</button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Risk profiles</h2>
        {riskProfiles.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No risk profiles set on Delta Engine yet.</p>
        ) : (
          <div className={`card ${styles.list}`}>
            {riskProfiles.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.cell}>{accountLabel(accounts, p.account_id)}</span>
                <span className={p.is_locked ? styles.badgeOff : styles.badgeOn}>
                  {p.is_locked ? (p.locked_reason || 'locked') : 'unlocked'}
                </span>
                <span className={styles.cellMuted}>{p.daily_trades_count}/{p.max_trades_per_day ?? '—'} trades today</span>
                {p.is_locked && <button onClick={() => handleUnlock(p)}>Unlock</button>}
                <button onClick={() => handleFlatten(p)} className="btn-ghost">Flatten positions</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function TradeCopierPage() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <div>
      <h1 className="page-title">Trade Copier</h1>

      {!deltaEngineConfigured && (
        <p className={styles.configNotice}>
          Delta Engine isn't configured yet — set VITE_DELTA_API_URL in .env.local for this page to actually work.
        </p>
      )}

      {!user ? (
        <>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to manage trade copiers.</p>
          <AuthPage />
        </>
      ) : (
        <TradeCopierWorkspace />
      )}
    </div>
  )
}
