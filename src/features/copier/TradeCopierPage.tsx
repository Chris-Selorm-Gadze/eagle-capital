import { useEffect, useState } from 'react'
import {
  copierConfigured,
  listAccounts, createCopier, enableCopier, disableCopier, deleteCopier,
  listRiskProfiles, unlockRiskProfile, flattenPositions,
  type DeltaAccount, type CopierGroup, type FollowerStats, type DeltaRiskProfile, type RiskMode,
} from '../../lib/copierClient'
import { subscribeCopierGroups } from '../../lib/copierGroupsSocket'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import { AddAccountDialog } from '../accounts/components/AddAccountDialog'
import styles from './TradeCopierPage.module.css'
import { useConfirm } from '../../shared/ui/confirm'

function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`
}

function pnlClass(n: number): string {
  if (n > 0) return styles.pnlGood
  if (n < 0) return styles.pnlBad
  return styles.pnlNeutral
}

function copyRateLabel(f: FollowerStats): string {
  return f.riskMode === 'risk_percent' ? `${f.multiplier}% risk` : `${f.multiplier}×`
}

function accountLabel(accounts: DeltaAccount[], id: string): string {
  const a = accounts.find((x) => x.id === id)
  return a ? (a.account_label || `${a.platform} · ${a.account_number}`) : id
}

function GroupCard({ group, onChanged }: { group: CopierGroup; onChanged: () => void }) {
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await action()
      onChanged()
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(f: FollowerStats) {
    if (!f.isEnabled && !(await confirm({ title: `Enable copying from ${group.master.label} to ${f.label}?`, description: 'This mirrors real orders immediately.', confirmLabel: 'Enable copying', destructive: true }))) return
    run(f.copierId, () => (f.isEnabled ? disableCopier(f.copierId) : enableCopier(f.copierId)))
  }

  async function handleRemoveFollower(f: FollowerStats) {
    if (!(await confirm({ title: `Remove ${f.label} from this copy group?`, confirmLabel: 'Remove', destructive: true }))) return
    run(f.copierId, () => deleteCopier(f.copierId))
  }

  async function handleFlatten(connectionId: string, label: string) {
    if (!(await confirm({ title: `Flatten all open positions on ${label}?`, description: 'This closes real positions immediately.', confirmLabel: 'Flatten positions', destructive: true }))) return
    run(connectionId, () => flattenPositions(connectionId))
  }

  function handleEnableAll() {
    const toEnable = group.followers.filter((f) => !f.isEnabled)
    if (toEnable.length === 0) return
    run('group', () => Promise.all(toEnable.map((f) => enableCopier(f.copierId))))
  }

  async function handleDisableAll() {
    const toDisable = group.followers.filter((f) => f.isEnabled)
    if (toDisable.length === 0) return
    if (!(await confirm({ title: `Disable all ${toDisable.length} active followers copying from ${group.master.label}?`, confirmLabel: 'Disable all', destructive: true }))) return
    run('group', () => Promise.all(toDisable.map((f) => disableCopier(f.copierId))))
  }

  async function handleDeleteGroup() {
    if (!(await confirm({ title: 'Delete this entire copy group?', description: `All ${group.followers.length} follower relations will be removed.`, confirmLabel: 'Delete group', destructive: true }))) return
    run('group', () => Promise.all(group.followers.map((f) => deleteCopier(f.copierId))))
  }

  const totalCapital = group.master.balance + group.followers.reduce((s, f) => s + f.balance, 0)
  const totalDaily = (group.master.dailyPnl ?? 0) + group.followers.reduce((s, f) => s + (f.dailyPnl ?? 0), 0)
  const totalUnrealized = group.master.unrealizedPnl + group.followers.reduce((s, f) => s + f.unrealizedPnl, 0)
  const enabledCount = group.followers.filter((f) => f.isEnabled).length

  return (
    <div className={`card ${styles.group}`}>
      <div className={styles.groupHeader}>
        <div className={styles.groupTitle}>
          <span className={styles.masterBadge}>MASTER</span>
          <span className={styles.masterLabel}>{group.master.label}</span>
          <span className={styles.followerCount}>
            {group.followers.length} follower{group.followers.length === 1 ? '' : 's'} · {enabledCount} copying
          </span>
        </div>
        <div className={styles.groupActions}>
          <button onClick={handleEnableAll} disabled={busyId === 'group'}>Enable all</button>
          <button onClick={handleDisableAll} disabled={busyId === 'group'}>Disable all</button>
          <button onClick={() => handleFlatten(group.master.connectionId, group.master.label)} className="btn-ghost" disabled={busyId === group.master.connectionId}>
            Flatten master
          </button>
          <button onClick={handleDeleteGroup} className="btn-ghost" disabled={busyId === 'group'}>Delete group</button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>Positions</th>
              <th>Daily P&L</th>
              <th>Unrealized</th>
              <th>Copy rate</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className={styles.masterRow}>
              <td>
                {group.master.label}
                <span className={styles.rowMeta}>Master · {group.master.broker}</span>
              </td>
              <td>{money(group.master.balance)}</td>
              <td>{group.master.openPositions}</td>
              <td className={pnlClass(group.master.dailyPnl ?? 0)}>{group.master.dailyPnl !== null ? money(group.master.dailyPnl) : '—'}</td>
              <td className={pnlClass(group.master.unrealizedPnl)}>{money(group.master.unrealizedPnl)}</td>
              <td>—</td>
              <td>—</td>
              <td className={styles.rowActions}>
                <button onClick={() => handleFlatten(group.master.connectionId, group.master.label)} className="btn-ghost" disabled={busyId === group.master.connectionId}>
                  Flatten
                </button>
              </td>
            </tr>
            {group.followers.map((f) => (
              <tr key={f.copierId}>
                <td>
                  {f.label}
                  <span className={styles.rowMeta}>Follower · {f.broker}</span>
                </td>
                <td>{money(f.balance)}</td>
                <td>{f.openPositions}</td>
                <td className={pnlClass(f.dailyPnl ?? 0)}>{f.dailyPnl !== null ? money(f.dailyPnl) : '—'}</td>
                <td className={pnlClass(f.unrealizedPnl)}>{money(f.unrealizedPnl)}</td>
                <td>{copyRateLabel(f)}</td>
                <td>
                  <span className={f.isEnabled ? styles.badgeOn : styles.badgeOff}>{f.isEnabled ? 'copying' : 'paused'}</span>
                </td>
                <td className={styles.rowActions}>
                  <button onClick={() => handleToggle(f)} disabled={busyId === f.copierId}>{f.isEnabled ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => handleFlatten(f.connectionId, f.label)} className="btn-ghost" disabled={busyId === f.copierId || busyId === f.connectionId}>Flatten</button>
                  <button onClick={() => handleRemoveFollower(f)} className="btn-ghost" disabled={busyId === f.copierId}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.groupFooter}>
        <span>{group.followers.length} follower account{group.followers.length === 1 ? '' : 's'}</span>
        <span>Group capital (master + followers): {money(totalCapital)}</span>
        <span className={pnlClass(totalUnrealized)}>Unrealized: {money(totalUnrealized)}</span>
        <span className={pnlClass(totalDaily)}>Daily P&L: {money(totalDaily)}</span>
      </div>
    </div>
  )
}

function TradeCopierWorkspace({ userId }: { userId: string }) {
  const [accounts, setAccounts] = useState<DeltaAccount[]>([])
  const [groups, setGroups] = useState<CopierGroup[] | null>(null)
  // null = "not loaded yet", distinct from "loaded, zero rows" — lets the Risk profiles section
  // show its own loading state without blocking the rest of the page.
  const [riskProfiles, setRiskProfiles] = useState<DeltaRiskProfile[] | null>(null)
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingAccount, setAddingAccount] = useState(false)

  const [masterId, setMasterId] = useState('')
  const [followerId, setFollowerId] = useState('')
  const [label, setLabel] = useState('')
  const [riskMode, setRiskMode] = useState<RiskMode>('multiplier')
  const [multiplier, setMultiplier] = useState('1.0')

  // Accounts is cheap (plain Supabase queries) — loads first and gates the page shell. Risk
  // profiles is NOT cheap: the backend makes live CopyFactory API calls (getStopouts +
  // getSubscriber) per follower on every request, with no caching. Loading it separately means a
  // slow risk-profiles fetch only blocks that one section instead of the whole page. Group data
  // (which needs a live MetaApi call per account) comes from the copier-groups WebSocket below,
  // so the page never re-fetches that from scratch on every visit either.
  async function loadAccounts() {
    setError(null)
    try {
      const a = await listAccounts()
      setAccounts(a.accounts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAccountsLoaded(true)
    }
  }

  async function loadRiskProfiles() {
    try {
      const r = await listRiskProfiles()
      setRiskProfiles(r.profiles)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function load() {
    loadAccounts()
    loadRiskProfiles()
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const unsubscribe = subscribeCopierGroups(setGroups, (message) => setError(message))
    return unsubscribe
  }, [])

  // Separate from load() so re-applying the default master pick can't clobber a selection the
  // user has already made.
  useEffect(() => {
    if (!masterId && accounts[0]) setMasterId(accounts[0].id)
  }, [accounts, masterId])

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

  async function handleUnlock(p: DeltaRiskProfile) {
    setError(null)
    try {
      await unlockRiskProfile(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!accountsLoaded) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  const groupsLoaded = groups !== null
  const safeGroups = groups ?? []
  const linkedAccountIds = new Set(safeGroups.flatMap((g) => [g.master.connectionId, ...g.followers.map((f) => f.connectionId)]))
  const unlinkedAccounts = accounts.filter((a) => !linkedAccountIds.has(a.id))

  const grandCapital = safeGroups.reduce((s, g) => s + g.master.balance + g.followers.reduce((s2, f) => s2 + f.balance, 0), 0)
  const grandDaily = safeGroups.reduce((s, g) => s + (g.master.dailyPnl ?? 0) + g.followers.reduce((s2, f) => s2 + (f.dailyPnl ?? 0), 0), 0)
  const grandFollowers = safeGroups.reduce((s, g) => s + g.followers.length, 0)

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      {groupsLoaded && safeGroups.length > 0 && (
        <div className={styles.summaryRow}>
          <span><strong>{safeGroups.length}</strong> master{safeGroups.length === 1 ? '' : 's'}</span>
          <span><strong>{grandFollowers}</strong> follower{grandFollowers === 1 ? '' : 's'}</span>
          <span>Total capital <strong>{money(grandCapital)}</strong></span>
          <span className={pnlClass(grandDaily)}>Today <strong>{money(grandDaily)}</strong></span>
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Copy trading groups</h2>
          <button onClick={() => setAddingAccount(true)} className="btn-primary">+ Connect an account to copy</button>
        </div>
        {!groupsLoaded ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading live account data…</p>
        ) : safeGroups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No copy trading groups yet — add one below.</p>
        ) : (
          <div className={styles.groupList}>
            {safeGroups.map((g) => <GroupCard key={g.master.connectionId} group={g} onChanged={load} />)}
          </div>
        )}

        {unlinkedAccounts.length > 0 && (
          <div className={styles.unlinkedNotice}>
            Not yet in a copy group: {unlinkedAccounts.map((a) => a.account_label || a.account_number).join(', ')}
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
              <option value="risk_percent">Risk percent</option>
            </select>
          </label>
          <label className="flex-1">{riskMode === 'risk_percent' ? 'Max risk per trade (%)' : 'Multiplier'}
            <input type="number" step="0.01" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={handleCreateCopier} disabled={!masterId || !followerId}>Add follower</button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Risk profiles</h2>
        {riskProfiles === null ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading risk profiles…</p>
        ) : riskProfiles.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No risk profiles yet — these appear once a copier relation exists.</p>
        ) : (
          <div className={`card ${styles.list}`}>
            {riskProfiles.map((p) => (
              <div key={p.id} className={styles.row}>
                <span className={styles.cell}>{accountLabel(accounts, p.account_id)}</span>
                <span className={p.is_locked ? styles.badgeOff : styles.badgeOn}>
                  {p.is_locked ? (p.locked_reason || 'locked') : 'unlocked'}
                </span>
                {p.is_locked && <button onClick={() => handleUnlock(p)}>Unlock</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {addingAccount && (
        <AddAccountDialog
          userId={userId}
          forceKind="live"
          forceLiveCategory="cfd"
          onClose={() => setAddingAccount(false)}
          onSaved={() => { setAddingAccount(false); load() }}
        />
      )}
    </div>
  )
}

export function TradeCopierPage() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <div>
      <h1 className="page-title">Trade Copier</h1>

      {!copierConfigured && (
        <p className={styles.configNotice}>
          Broker sync isn't configured yet — set VITE_BROKER_SYNC_API_URL in .env.local for this page to actually work.
        </p>
      )}

      {!user ? (
        <>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to manage trade copiers.</p>
          <AuthPage />
        </>
      ) : (
        <TradeCopierWorkspace userId={user.id} />
      )}
    </div>
  )
}
