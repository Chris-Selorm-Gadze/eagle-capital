import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listTradingAccounts, listCopierRelations, listRiskProfiles,
  listWorkerNodes, listRecentExecutionEvents, listPendingCommands,
  buildCopierGroups, unlinkedAccounts, isRelationLive, hasPendingTest, anyWorkerLive,
  type TradingAccount, type CopierRelation, type RiskProfile,
  type WorkerNode, type ExecutionEvent, type CopierGroup, type CopierFollower, type RiskMode,
  type PendingCommand,
} from '../../db/copier'
import {
  createCopierLink, setCopierEnabled, deleteCopierLink,
  unlockRiskProfile, flattenAccount, testConnection, disconnectAccount,
} from '../../db/copierActions'
import { useAuth } from '../auth/AuthContext'
import { AuthPage } from '../auth/AuthPage'
import { LoadError } from '../../shared/ui/LoadError'
import { useConfirm } from '../../shared/ui/confirm'
import { sharesTerminal } from './brokerPresets'
import { WorkerStatus } from './components/WorkerStatus'
import { ExecutionLog } from './components/ExecutionLog'
import { AddCopierAccountDialog } from './components/AddCopierAccountDialog'
import { FixCredentialsDialog } from './components/FixCredentialsDialog'
import { JournalLinkDialog } from './components/JournalLinkDialog'
import { listAccounts } from '../../db/accounts'
import type { Account } from '../../types'
import styles from './TradeCopierPage.module.css'

/* Trade Copier.
 *
 * Reads come from Supabase (db/copier.ts) and writes go there too
 * (db/copierActions.ts) — RLS scopes both to the signed-in user, so there is no
 * API layer in between. Anything the WORKER has to do is queued as a
 * worker_command and picked up on its next outbound poll. The worker's own
 * liveness sits at the top of the page; without it, none of the rest means
 * anything. */

function money(n: number | null): string {
  if (n === null) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`
}

/** `C:\\Program Files\\FTMO ... \\terminal64.exe` -> `FTMO ...`. The folder is
 * what tells you which broker's build this is; the full path is in the title. */
function terminalFolder(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length >= 2 ? (parts[parts.length - 2] as string) : path
}

function accountName(a: TradingAccount): string {
  return a.label || `${a.platform} · ${a.accountNumber}`
}

function copyRateLabel(r: CopierRelation): string {
  if (r.riskMode === 'risk_percent') return `${r.multiplier}% risk`
  if (r.riskMode === 'fixed_lot') return `${r.fixedLotSize} lots`
  if (r.riskMode === 'equity_ratio') return 'equity ratio'
  return `${r.multiplier}×`
}

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  auth_failed: 'Login rejected',
  terminal_unavailable: 'Terminal not running',
  broker_unavailable: 'Broker unreachable',
  disabled: 'Disabled',
  locked: 'Locked',
}

/* "Disconnected" is the schema default, and nothing but a worker can change it:
 * the browser cannot reach a broker and neither can the gateway. So a brand new
 * account reads Disconnected whether the credentials are wrong, right, or never
 * tried — and the only way to tell is whether a test is still in the queue. */
function ConnectionPill({ account, pending }: { account: TradingAccount; pending?: boolean }) {
  if (pending) {
    return <span className={styles.badgePending} title="Queued for the worker">Testing…</span>
  }
  const connected = account.connectionStatus === 'connected'
  return (
    <span
      className={connected ? styles.badgeOn : styles.badgeOff}
      title={account.lastError ?? undefined}
    >
      {STATUS_LABEL[account.connectionStatus] ?? account.connectionStatus}
    </span>
  )
}

function GroupCard({ group, onChanged }: { group: CopierGroup; onChanged: () => void }) {
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  /* Arming is always an explicit, named confirmation. Creating a link and
   * turning it on are separate acts on purpose — the second one starts placing
   * real orders, and it should never be one stray click away. */
  async function handleToggle(f: CopierFollower) {
    if (!f.relation.isEnabled) {
      const ok = await confirm({
        title: `Start copying ${accountName(group.master)} → ${accountName(f.account)}?`,
        description: 'Orders on the master will be mirrored to this account with real money from now on.',
        confirmLabel: 'Start copying',
        destructive: true,
      })
      if (!ok) return
    }
    run(f.relation.id, () => setCopierEnabled(f.relation.id, group.master.id, !f.relation.isEnabled))
  }

  async function handleRemove(f: CopierFollower) {
    const ok = await confirm({
      title: `Remove ${accountName(f.account)} from this copy group?`,
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (ok) run(f.relation.id, () => deleteCopierLink(f.relation.id, group.master.id))
  }

  async function handleFlatten(account: TradingAccount) {
    const ok = await confirm({
      title: `Close every open position on ${accountName(account)}?`,
      description: 'This closes real positions at market. The worker picks it up within a couple of seconds.',
      confirmLabel: 'Flatten now',
      destructive: true,
    })
    if (ok) run(account.id, () => flattenAccount(account.id))
  }

  async function handleDisableAll() {
    const armed = group.followers.filter((f) => f.relation.isEnabled)
    if (armed.length === 0) return
    const ok = await confirm({
      title: `Stop all ${armed.length} active copy link${armed.length === 1 ? '' : 's'} from ${accountName(group.master)}?`,
      confirmLabel: 'Stop copying',
      destructive: true,
    })
    if (ok) run('group', () => Promise.all(armed.map((f) => setCopierEnabled(f.relation.id, group.master.id, false))))
  }

  const armedCount = group.followers.filter((f) => f.relation.isEnabled).length
  const liveCount = group.followers.filter((f) => isRelationLive(f.relation, group.master, f.account)).length
  const groupCapital = (group.master.balance ?? 0) + group.followers.reduce((s, f) => s + (f.account.balance ?? 0), 0)

  return (
    <div className={`card ${styles.group}`}>
      <div className={styles.groupHeader}>
        <div className={styles.groupTitle}>
          <span className={styles.masterBadge}>MASTER</span>
          <span className={styles.masterLabel}>{accountName(group.master)}</span>
          <ConnectionPill account={group.master} />
          <span className={styles.followerCount}>
            {group.followers.length} follower{group.followers.length === 1 ? '' : 's'} · {liveCount} copying now
          </span>
        </div>
        <div className={styles.groupActions}>
          <button onClick={handleDisableAll} disabled={busyId === 'group' || armedCount === 0}>Stop all</button>
          <button onClick={() => handleFlatten(group.master)} className="btn-ghost" disabled={busyId === group.master.id}>
            Flatten master
          </button>
        </div>
      </div>

      {/* Armed but not actually running is the dangerous middle state: the link
          says on, and nothing is being mirrored. Say so rather than showing a
          green toggle over a dead connection. */}
      {armedCount > liveCount && (
        <div className={styles.warnStrip}>
          {armedCount - liveCount} link{armedCount - liveCount === 1 ? ' is' : 's are'} switched on but not copying —
          an account in the pair is not connected.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>Equity</th>
              <th>Copy rate</th>
              <th>Connection</th>
              <th>Copying</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr className={styles.masterRow}>
              <td>
                {accountName(group.master)}
                <span className={styles.rowMeta}>{group.master.brokerServer}</span>
              </td>
              <td>{money(group.master.balance)}</td>
              <td>{money(group.master.equity)}</td>
              <td>—</td>
              <td><ConnectionPill account={group.master} /></td>
              <td>—</td>
              <td />
            </tr>
            {group.followers.map((f) => {
              const live = isRelationLive(f.relation, group.master, f.account)
              return (
                <tr key={f.relation.id}>
                  <td>
                    {accountName(f.account)}
                    <span className={styles.rowMeta}>{f.account.brokerServer}</span>
                  </td>
                  <td>{money(f.account.balance)}</td>
                  <td>{money(f.account.equity)}</td>
                  <td>{copyRateLabel(f.relation)}</td>
                  <td><ConnectionPill account={f.account} /></td>
                  <td>
                    <span className={live ? styles.badgeOn : styles.badgeOff}>
                      {live ? 'Live' : f.relation.isEnabled ? 'Armed, not live' : 'Off'}
                    </span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button onClick={() => handleToggle(f)} disabled={busyId === f.relation.id}>
                        {f.relation.isEnabled ? 'Stop' : 'Start'}
                      </button>
                      <button onClick={() => handleFlatten(f.account)} className="btn-ghost" disabled={busyId === f.account.id}>
                        Flatten
                      </button>
                      <button onClick={() => handleRemove(f)} className="btn-ghost" disabled={busyId === f.relation.id}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.groupFooter}>
        <span>Group capital {money(groupCapital)}</span>
        <span>{armedCount} of {group.followers.length} armed</span>
      </div>
    </div>
  )
}

function TradeCopierWorkspace({ userId, onAccountsChanged }: {
  userId: string
  /** Refetches the app's own `accounts`/`trades`. Journalling writes to a table
   * this page does not own, so without telling App the dashboard shows stale
   * data until a reload. */
  onAccountsChanged?: () => void
}) {
  const confirm = useConfirm()

  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [relations, setRelations] = useState<CopierRelation[]>([])
  const [riskProfiles, setRiskProfiles] = useState<RiskProfile[]>([])
  const [workers, setWorkers] = useState<WorkerNode[]>([])
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [pending, setPending] = useState<PendingCommand[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // A queued worker command succeeds instantly at the database and then takes a
  // moment to actually happen. Saying so is the difference between a button that
  // feels broken and one the user knows is in flight.
  const [notice, setNotice] = useState<string | null>(null)
  const [addingAccount, setAddingAccount] = useState(false)
  const [fixingAccount, setFixingAccount] = useState<TradingAccount | null>(null)
  const [journallingAccount, setJournallingAccount] = useState<TradingAccount | null>(null)
  // The dashboard's own accounts, which are a different table from the copier's
  // -- `accounts` versus `trading_accounts`. Loaded here only so an account can
  // be pointed at one of them.
  const [dashboardAccounts, setDashboardAccounts] = useState<Account[]>([])

  const [masterId, setMasterId] = useState('')
  const [followerId, setFollowerId] = useState('')
  const [label, setLabel] = useState('')
  const [riskMode, setRiskMode] = useState<RiskMode>('multiplier')
  const [multiplier, setMultiplier] = useState('1.0')

  /* One load for everything. These are six small, RLS-scoped reads against the
   * same database the rest of the app already talks to, so there is nothing to
   * gain from staging them — and a partial page is harder to reason about than
   * one that either loaded or didn't. */
  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [a, r, p, w, e, c, d] = await Promise.all([
        listTradingAccounts(),
        listCopierRelations(),
        listRiskProfiles(),
        listWorkerNodes(),
        listRecentExecutionEvents(),
        listPendingCommands(),
        listAccounts(),
      ])
      setDashboardAccounts(d)
      setAccounts(a)
      setRelations(r)
      setRiskProfiles(p)
      setWorkers(w)
      setEvents(e)
      setPending(c)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /* Dashboard accounts already receiving trades from a connected account. One
   * each, or a master and its five followers would all write the same fill to
   * one account and sextuple its P&L. */
  const takenJournalIds = useMemo(
    () => new Set(accounts.map((a) => a.journalAccountId).filter((id): id is string => !!id)),
    [accounts],
  )

  /* Worker heartbeats and balances change without anything happening in this
   * tab, so the page refreshes itself. Thirty seconds matches the worker's own
   * heartbeat interval — polling faster would only re-read rows that cannot have
   * moved yet. */
  useEffect(() => {
    const id = setInterval(() => { load() }, 30_000)
    return () => clearInterval(id)
  }, [load])

  /* Recomputed on every 30s refresh, so a worker that dies mid-session flips the
   * page's language without a reload. */
  const workerOnline = useMemo(() => anyWorkerLive(workers), [workers])

  const groups = useMemo(() => buildCopierGroups(accounts, relations), [accounts, relations])
  const unlinked = useMemo(() => unlinkedAccounts(accounts, relations), [accounts, relations])

  /* Accounts grouped by the MT5 install they open with, keeping only the groups
   * with more than one member — those are the pairs paying a login swap. */
  const sharedTerminalGroups = useMemo(() => {
    const withPath = accounts.filter((a) => a.terminalPath)
    const groups: { path: string; names: string[] }[] = []
    for (const account of withPath) {
      const existing = groups.find((g) => sharesTerminal(g.path, account.terminalPath))
      if (existing) existing.names.push(accountName(account))
      else groups.push({ path: account.terminalPath as string, names: [accountName(account)] })
    }
    return groups.filter((g) => g.names.length > 1)
  }, [accounts])

  useEffect(() => {
    if (!masterId && accounts[0]) setMasterId(accounts[0].id)
  }, [accounts, masterId])

  async function handleCreateCopier() {
    if (!masterId || !followerId || masterId === followerId) return
    setActionError(null)
    try {
      await createCopierLink({
        masterAccountId: masterId,
        followerAccountId: followerId,
        label: label.trim() || undefined,
        riskMode: riskMode,
        multiplier: Number(multiplier),
      })
      setLabel('')
      setFollowerId('')
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleUnlock(p: RiskProfile) {
    const account = accounts.find((a) => a.id === p.accountId)
    const ok = await confirm({
      title: `Unlock ${account ? accountName(account) : 'this account'}?`,
      description: p.lockedReason
        ? `It was locked because: ${p.lockedReason}. Unlocking lets it trade again immediately.`
        : 'Unlocking lets it trade again immediately.',
      confirmLabel: 'Unlock',
      destructive: true,
    })
    if (!ok) return
    setActionError(null)
    try {
      await unlockRiskProfile(p.id)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  /* The queue write always succeeds — it is a row in this user's own table. What
   * it does NOT tell you is whether anything will ever read it. Promising that
   * "the worker will report back" when no worker is running is how an account
   * sits on Disconnected looking like a credentials problem when the real answer
   * is that nothing is listening. */
  async function handleTestConnection(account: TradingAccount) {
    setActionError(null)
    try {
      const result = await testConnection(account.id)
      const live = anyWorkerLive(workers)
      if (!live) {
        setNotice(
          `Test queued for ${accountName(account)}, but no worker is online to run it — ` +
          'so nothing will happen yet. Start the worker on the Windows machine and it picks ' +
          'this up on its next poll. Until then the account stays on Disconnected, which is ' +
          'not a verdict on the credentials.',
        )
      } else if (result === 'already-pending') {
        setNotice(`A test for ${accountName(account)} is already queued — waiting on the worker.`)
      } else {
        setNotice(`Connection test queued for ${accountName(account)} — the worker will report back within a few seconds.`)
      }
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  /* Deleting the row cascades: copy links, symbol mappings and risk profiles
   * for this account go with it. Execution history survives (those columns are
   * ON DELETE SET NULL) but loses its link to the account. None of that is
   * recoverable, so the confirmation says what goes rather than asking "are you
   * sure" — and a mistyped password does not need any of it, which is what the
   * second line is for. */
  async function handleRemoveAccount(account: TradingAccount) {
    const linked = relations.filter(
      (r) => r.masterAccountId === account.id || r.followerAccountId === account.id,
    ).length
    const ok = await confirm({
      title: `Remove ${accountName(account)}?`,
      description:
        (linked > 0
          ? `This also deletes ${linked} copy link${linked === 1 ? '' : 's'}, plus any `
          : 'This also deletes any ')
        + 'symbol mappings and risk limits for this account. Copy history is kept. '
        + 'If you only need to correct a password or server, use Fix credentials instead — '
        + 'that keeps everything.',
      confirmLabel: 'Remove account',
      destructive: true,
    })
    if (!ok) return
    setActionError(null)
    try {
      await disconnectAccount(account.id)
      setNotice(`${accountName(account)} removed.`)
      await load()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!loaded) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
  if (loadError) return <LoadError message={loadError} onRetry={load} />

  const lockedProfiles = riskProfiles.filter((p) => p.isLocked)

  return (
    <div>
      <WorkerStatus workers={workers} loading={false} />

      {actionError && <div className={styles.error}>{actionError}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {lockedProfiles.length > 0 && (
        <div className={styles.warnStrip}>
          {lockedProfiles.length} account{lockedProfiles.length === 1 ? ' is' : 's are'} locked by their risk
          rules and will not take new trades until unlocked.
        </div>
      )}

      <section className={styles.section}>
        <div className="section-title-row">
          <h2 className="section-title">Copy groups</h2>
          <button onClick={() => setAddingAccount(true)} className="btn-primary">Connect an account</button>
        </div>

        {groups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            {accounts.length === 0
              ? 'No accounts connected yet. Connect a master and at least one follower to start copying.'
              : 'No copy links yet — pair a master with a follower below.'}
          </p>
        ) : (
          <div className={styles.groupList}>
            {groups.map((g) => (
              <GroupCard key={g.master.id} group={g} onChanged={load} />
            ))}
          </div>
        )}

        {unlinked.length > 0 && (
          <div className={styles.unlinkedNotice}>
            Connected but not in a copy group: {unlinked.map(accountName).join(', ')}
          </div>
        )}

        {accounts.length >= 2 && (
          <div className={`card ${styles.addRow}`}>
            <label className="flex-1">Master
              <select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{accountName(a)}</option>)}
              </select>
            </label>
            <label className="flex-1">Follower
              <select value={followerId} onChange={(e) => setFollowerId(e.target.value)}>
                <option value="">Select…</option>
                {accounts.filter((a) => a.id !== masterId).map((a) => (
                  <option key={a.id} value={a.id}>{accountName(a)}</option>
                ))}
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
            <label className="flex-1">{riskMode === 'risk_percent' ? 'Max risk per trade (%)' : 'Multiplier'}
              <input type="number" step="0.01" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
            </label>
            <button className="btn-primary" onClick={handleCreateCopier} disabled={!masterId || !followerId}>
              Create link
            </button>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className="section-title">Connected accounts</h2>
        {accounts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No accounts connected yet.</p>
        ) : (
          <>
            {/* Accounts sharing an MT5 install get ONE pool worker with
                max_workers=1, so their copies queue rather than run in
                parallel — the worker logs into each in turn. The cost is
                therefore per-follower, not flat: the last one in the queue
                waits for every switch before it. Accounts at different brokers
                already have separate terminals and cost nothing. */}
            {/* The question this answers is "I have six accounts copying and my
                dashboard says my desk is empty". The copier writes
                trading_accounts and execution_events; the dashboard reads
                accounts and trades. Nothing joined them until an account is
                pointed at a dashboard account, and there is no other place in
                the product where a trader would go looking for that. */}
            {accounts.length > 0 && takenJournalIds.size === 0 && (
              <div className={styles.warnStrip}>
                <div>
                  None of these accounts report to the dashboard yet, so it has no trades to
                  show even while copies are running. Use <strong>Journal trades</strong> on an
                  account to point it at a dashboard account — closed positions then arrive on
                  their own, with the broker’s own profit figure.
                </div>
              </div>
            )}

            {sharedTerminalGroups.length > 0 && (
              <div className={styles.warnStrip}>
                {sharedTerminalGroups.map((g) => (
                  <div key={g.path}>
                    {g.names.join(', ')} share one MT5 install, so their copies run
                    <strong> one after another</strong> — the worker logs into each in turn.
                    With {g.names.length} accounts the last one waits for {g.names.length - 1}{' '}
                    login switch{g.names.length - 1 === 1 ? '' : 'es'} before its order is placed.
                    Give each its own portable copy of that broker’s terminal to run them in parallel.
                  </div>
                ))}
              </div>
            )}
            <div className={`card card-flush ${styles.list}`}>
              {accounts.map((a) => {
                const testing = hasPendingTest(pending, a.id)
                return (
                  <div key={a.id} className={styles.accountEntry}>
                    <div className={styles.row}>
                      <span className={styles.cell}>{accountName(a)}</span>
                      <ConnectionPill account={a} pending={testing} />
                      {/* An unassigned terminal is the normal state for a new
                          account, not a fault: the worker claims one on the first
                          successful connection test. */}
                      {a.terminalPath
                        ? <span className={styles.cellMuted} title={a.terminalPath}>{terminalFolder(a.terminalPath)}</span>
                        : <span className={styles.cellMuted}>terminal not assigned yet</span>}
                      {/* Round trip to this broker's trade server. Copy latency
                          cannot go below it, so a broker that is simply far away
                          looks completely different here from one where the
                          copier itself is slow. */}
                      {a.brokerPingMs !== null && (
                        <span
                          className={styles.cellMuted}
                          title="Round trip to this broker's trade server. Copy latency cannot go below it."
                        >
                          {a.brokerPingMs} ms to broker
                        </span>
                      )}
                      <div className={styles.rowButtons}>
                        <button onClick={() => handleTestConnection(a)} disabled={testing}>
                          {testing ? 'Testing…' : 'Retest'}
                        </button>
                        <button
                          onClick={() => setJournallingAccount(a)}
                          className="btn-ghost"
                          title={a.journalAccountId
                            ? 'Closed trades from this account are journalled to the dashboard'
                            : 'Send this account\u2019s closed trades to the dashboard'}
                        >
                          {a.journalAccountId ? 'Journalling' : 'Journal trades'}
                        </button>
                        <button onClick={() => setFixingAccount(a)} className="btn-ghost">
                          Fix credentials
                        </button>
                        <button onClick={() => handleRemoveAccount(a)} className="btn-ghost">
                          Remove
                        </button>
                      </div>
                    </div>
                    {/* The worker writes the broker's own words here when a test
                        fails. It was previously a `title` tooltip only, which is
                        invisible on touch and easy to miss — so "Login rejected"
                        arrived with no reason attached. */}
                    {!testing && a.lastError && (
                      <p className={styles.rowError}>{a.lastError}</p>
                    )}
                    {testing && !workerOnline && (
                      <p className={styles.rowError}>
                        Queued, but no worker is online to run it.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2 className="section-title">Risk profiles</h2>
        {riskProfiles.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>
            No risk profiles yet — one is created per account when you set loss limits on it.
          </p>
        ) : (
          <div className={`card card-flush ${styles.list}`}>
            {riskProfiles.map((p) => {
              const account = accounts.find((a) => a.id === p.accountId)
              return (
                <div key={p.id} className={styles.row}>
                  <span className={styles.cell}>{account ? accountName(account) : 'deleted account'}</span>
                  <span className={styles.cellMuted}>
                    {p.maxDailyLoss !== null ? `daily loss cap ${money(p.maxDailyLoss)}` : 'no daily cap'}
                    {' · '}
                    {p.dailyTradesCount} trade{p.dailyTradesCount === 1 ? '' : 's'} today
                  </span>
                  <span className={p.isLocked ? styles.badgeOff : styles.badgeOn}>
                    {p.isLocked ? (p.lockedReason || 'locked') : 'active'}
                  </span>
                  {p.isLocked && <button onClick={() => handleUnlock(p)}>Unlock</button>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className="section-title">Copy log</h2>
        <ExecutionLog events={events} accounts={accounts} />
      </section>

      {addingAccount && (
        <AddCopierAccountDialog
          onClose={() => setAddingAccount(false)}
          onSaved={() => { setAddingAccount(false); load() }}
        />
      )}

      {journallingAccount && (
        <JournalLinkDialog
          account={journallingAccount}
          dashboardAccounts={dashboardAccounts}
          takenIds={takenJournalIds}
          userId={userId}
          onClose={() => setJournallingAccount(null)}
          onSaved={(message) => {
            setJournallingAccount(null)
            setNotice(message)
            load()
            onAccountsChanged?.()
          }}
        />
      )}

      {fixingAccount && (
        <FixCredentialsDialog
          account={fixingAccount}
          onClose={() => setFixingAccount(null)}
          onSaved={() => {
            setFixingAccount(null)
            setNotice('Credentials saved. Test the connection to check them.')
            load()
          }}
        />
      )}
    </div>
  )
}

export function TradeCopierPage({ onAccountsChanged }: { onAccountsChanged?: () => void }) {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <div>
      <h1 className="page-title">Trade Copier</h1>

      {!user ? (
        <>
          <p style={{ color: 'var(--text-secondary)' }}>Sign in to manage trade copiers.</p>
          <AuthPage />
        </>
      ) : (
        <TradeCopierWorkspace userId={user.id} onAccountsChanged={onAccountsChanged} />
      )}
    </div>
  )
}
