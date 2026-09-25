import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTableStream } from '../../db/useTableStream'
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
  journalAllAccounts,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState, ErrorNotice, Notice, PageHeader } from '@/shared/ui/page'
import { CopyIcon } from 'lucide-react'
import { cn } from 'cn'
import styles from './TradeCopierPage.module.css'

/* Converted onto shadcn Card, Table, Select, Input and Badge, and onto the
 * shared page kit for its headers, errors and the six warn-strips this page
 * carries. The module stylesheet keeps only the table's scroll box. */

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
    return <Badge title="Queued for the worker" variant="secondary">Testing…</Badge>
  }
  const connected = account.connectionStatus === 'connected'
  return (
    <Badge
      style={{
        background: `color-mix(in srgb, ${connected ? 'var(--good)' : 'var(--critical)'} 15%, transparent)`,
        color: connected ? 'var(--good-deep)' : 'var(--critical-deep)',
      }}
      variant="secondary"
      title={account.lastError ?? undefined}
    >
      {STATUS_LABEL[account.connectionStatus] ?? account.connectionStatus}
    </Badge>
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
    <Card className="gap-0 py-0">
      <CardHeader className="flex-wrap gap-x-3 gap-y-2 border-b py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge className="tracking-wide" variant="default">MASTER</Badge>
          <CardTitle className="truncate">{accountName(group.master)}</CardTitle>
          <ConnectionPill account={group.master} />
          <span className="text-muted-foreground text-xs">
            {group.followers.length} follower{group.followers.length === 1 ? '' : 's'} · {liveCount} copying now
          </span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            disabled={busyId === 'group' || armedCount === 0}
            onClick={handleDisableAll}
            size="xs"
            variant="outline"
          >
            Stop all
          </Button>
          <Button
            disabled={busyId === group.master.id}
            onClick={() => handleFlatten(group.master)}
            size="xs"
            variant="destructive"
          >
            Flatten master
          </Button>
        </div>
      </CardHeader>

      {/* Armed but not actually running is the dangerous middle state: the link
          says on, and nothing is being mirrored. Say so rather than showing a
          green toggle over a dead connection. */}
      {armedCount > liveCount && (
        <Notice className="mx-4 mt-3">
          {armedCount - liveCount} link{armedCount - liveCount === 1 ? ' is' : 's are'} switched on but not copying —
          an account in the pair is not connected.
        </Notice>
      )}

      {error && <ErrorNotice className="mx-4 mt-3" message={error} />}

      <CardContent className={cn('px-0', styles.tableWrap)}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Equity</TableHead>
              <TableHead>Copy rate</TableHead>
              <TableHead>Connection</TableHead>
              <TableHead>Copying</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell>
                <span className="font-medium">{accountName(group.master)}</span>
                <span className="block text-muted-foreground text-xs">{group.master.brokerServer}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(group.master.balance)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(group.master.equity)}</TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell><ConnectionPill account={group.master} /></TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell />
            </TableRow>
            {group.followers.map((f) => {
              const live = isRelationLive(f.relation, group.master, f.account)
              return (
                <TableRow key={f.relation.id}>
                  <TableCell>
                    <span className="font-medium">{accountName(f.account)}</span>
                    <span className="block text-muted-foreground text-xs">{f.account.brokerServer}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(f.account.balance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(f.account.equity)}</TableCell>
                  <TableCell>{copyRateLabel(f.relation)}</TableCell>
                  <TableCell><ConnectionPill account={f.account} /></TableCell>
                  <TableCell>
                    {/* Three states, not two — "armed but not live" is the one
                        that matters, and a plain on/off badge hid it. */}
                    <Badge
                      style={{
                        background: `color-mix(in srgb, ${live ? 'var(--good)' : f.relation.isEnabled ? 'var(--warning)' : 'var(--text-muted)'} 15%, transparent)`,
                        color: live ? 'var(--good-deep)' : f.relation.isEnabled ? 'var(--warning)' : 'var(--text-muted)',
                      }}
                      variant="secondary"
                    >
                      {live ? 'Live' : f.relation.isEnabled ? 'Armed, not live' : 'Off'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      disabled={busyId === f.relation.id}
                      onClick={() => handleToggle(f)}
                      size="xs"
                      variant="outline"
                    >
                      {f.relation.isEnabled ? 'Stop' : 'Start'}
                    </Button>{' '}
                    <Button
                      disabled={busyId === f.account.id}
                      onClick={() => handleFlatten(f.account)}
                      size="xs"
                      variant="ghost"
                    >
                      Flatten
                    </Button>{' '}
                    <Button
                      disabled={busyId === f.relation.id}
                      onClick={() => handleRemove(f)}
                      size="xs"
                      variant="destructive"
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>

      <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-2.5 text-muted-foreground text-xs">
        <span>Group capital <span className="tabular-nums">{money(groupCapital)}</span></span>
        <span>{armedCount} of {group.followers.length} armed</span>
      </div>
    </Card>
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
  const unjournalledCount = accounts.filter((a) => !a.journalAccountId).length

  /* Balances, connection status and copy events are pushed, so this page shows
   * a fill the moment it lands rather than up to thirty seconds later. Both
   * streams reload the page's own data, throttled: an active copy session
   * writes an execution event per fill, and reloading seven tables on each one
   * would spend the session refetching. */
  useTableStream('trading_accounts', userId, load)
  useTableStream('execution_events', userId, load, { settleMs: 700, minIntervalMs: 4_000 })

  /* Worker heartbeats are not a table write, so they still need asking after.
   * Paused while the tab is hidden: seven table reads every thirty seconds,
   * forever, in a tab nobody is looking at, was the heaviest poll in the app. */
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id !== null) return
      id = setInterval(() => { load() }, 30_000)
    }
    const stop = () => {
      if (id === null) return
      clearInterval(id)
      id = null
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return stop()
      // Catch up on whatever was missed while hidden, then resume.
      load()
      start()
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
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
  /* Give every unjournalled account its own dashboard account, in one go.
   *
   * The alternative was seven dialogs, each repeating the same two choices the
   * user already made once. It creates rather than links because there is
   * nothing to link to yet, and it only ever touches accounts that are not
   * already journalled, so pressing it twice cannot produce duplicates.
   */
  async function handleJournalAll() {
    const unjournalled = accounts.filter((a) => !a.journalAccountId)
    if (unjournalled.length === 0) return

    const ok = await confirm({
      title: `Journal ${unjournalled.length} account${unjournalled.length === 1 ? '' : 's'}?`,
      description:
        'This creates one dashboard account for each, named after the broker account: '
        + `${unjournalled.map(accountName).join(', ')}. `
        + 'Their closed trades then arrive on the dashboard on their own. '
        + 'Drawdown limits and profit targets are left blank for you to fill in.',
      confirmLabel: 'Create and journal',
    })
    if (!ok) return

    setActionError(null)
    setNotice(`Creating ${unjournalled.length} dashboard accounts…`)

    const { created, failed } = await journalAllAccounts(userId, unjournalled)

    await load()
    onAccountsChanged?.()

    if (failed.length > 0) {
      setNotice(null)
      setActionError(
        `Journalled ${created}, but could not do ${failed.join(', ')}. `
        + 'Use Journal trades on those to see why.',
      )
    } else {
      setNotice(
        `${created} account${created === 1 ? '' : 's'} journalled. Closed trades arrive `
        + 'within a few minutes, and the first sync reaches back 72 hours.',
      )
    }
  }

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
    <div className="flex flex-col gap-5">
      <WorkerStatus workers={workers} loading={false} />

      {actionError && <ErrorNotice message={actionError} />}
      {notice && <Notice tone="info">{notice}</Notice>}

      {lockedProfiles.length > 0 && (
        <Notice>
          {lockedProfiles.length} account{lockedProfiles.length === 1 ? ' is' : 's are'} locked by their risk
          rules and will not take new trades until unlocked.
        </Notice>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">Copy groups</h2>
          <Button onClick={() => setAddingAccount(true)} size="sm">Connect an account</Button>
        </div>

        {groups.length === 0 ? (
          <EmptyState
            action={accounts.length === 0
              ? { label: 'Connect an account', onClick: () => setAddingAccount(true) }
              : undefined}
            description={accounts.length === 0
              ? 'Connect a master and at least one follower, and every order on the master is mirrored onto the followers.'
              : 'Your accounts are connected — pair a master with a follower below to start copying.'}
            icon={<CopyIcon />}
            title={accounts.length === 0 ? 'No accounts connected yet' : 'No copy links yet'}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <GroupCard key={g.master.id} group={g} onChanged={load} />
            ))}
          </div>
        )}

        {unlinked.length > 0 && (
          <Notice tone="info">
            Connected but not in a copy group: {unlinked.map(accountName).join(', ')}
          </Notice>
        )}

        {accounts.length >= 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Pair a master with a follower</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copier-master">Master</Label>
                <Select onValueChange={setMasterId} value={masterId}>
                  <SelectTrigger id="copier-master"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{accountName(a)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copier-follower">Follower</Label>
                <Select onValueChange={setFollowerId} value={followerId}>
                  <SelectTrigger id="copier-follower">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== masterId).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{accountName(a)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copier-label">Label</Label>
                <Input
                  id="copier-label"
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="optional"
                  value={label}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copier-riskmode">Risk mode</Label>
                <Select onValueChange={(v) => setRiskMode(v as RiskMode)} value={riskMode}>
                  <SelectTrigger id="copier-riskmode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiplier">Multiplier</SelectItem>
                    <SelectItem value="fixed_lot">Fixed lot</SelectItem>
                    <SelectItem value="equity_ratio">Equity ratio</SelectItem>
                    <SelectItem value="risk_percent">Risk percent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copier-multiplier">
                  {riskMode === 'risk_percent' ? 'Max risk per trade (%)' : 'Multiplier'}
                </Label>
                <Input
                  id="copier-multiplier"
                  onChange={(e) => setMultiplier(e.target.value)}
                  step="0.01"
                  type="number"
                  value={multiplier}
                />
              </div>

              <div className="flex items-end">
                <Button disabled={!masterId || !followerId} onClick={handleCreateCopier}>
                  Create link
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">Connected accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No accounts connected yet.</p>
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
            {/* Shown for a PARTLY journalled desk too. It used to appear only
                when none were, so a master journalled with two of its four
                followers left out looked fine here while the dashboard quietly
                recorded three of every five copies. */}
            {unjournalledCount > 0 && (
              <Notice
                action={
                  <Button onClick={handleJournalAll} size="xs" variant="outline">
                    {takenJournalIds.size === 0
                      ? `Journal all ${unjournalledCount} account${unjournalledCount === 1 ? '' : 's'}`
                      : `Journal the other ${unjournalledCount}`}
                  </Button>
                }
              >
                {takenJournalIds.size === 0 ? (
                  <>
                    None of these accounts report to the dashboard yet, so it has no trades to
                    show even while copies are running. Closed positions arrive on their own once
                    an account is journalled, with the broker’s own profit figure.
                  </>
                ) : (
                  <>
                    {unjournalledCount} of these accounts {unjournalledCount === 1 ? 'does' : 'do'}{' '}
                    not report to the dashboard, so {unjournalledCount === 1 ? 'its' : 'their'} trades
                    are missing from it — a copied trade shows up only on the accounts that are
                    journalled. Journalling {unjournalledCount === 1 ? 'it' : 'them'} now also brings in
                    the last 72 hours.
                  </>
                )}
              </Notice>
            )}

            {sharedTerminalGroups.length > 0 && (
              <Notice>
                {sharedTerminalGroups.map((g) => (
                  <div className="mb-1.5 last:mb-0" key={g.path}>
                    {g.names.join(', ')} share one MT5 install, so their copies run
                    <strong> one after another</strong> — the worker logs into each in turn.
                    With {g.names.length} accounts the last one waits for {g.names.length - 1}{' '}
                    login switch{g.names.length - 1 === 1 ? '' : 'es'} before its order is placed.
                    Give each its own portable copy of that broker’s terminal to run them in parallel.
                  </div>
                ))}
              </Notice>
            )}
            <Card className="gap-0 py-0"><CardContent className="px-0">
              {accounts.map((a) => {
                const testing = hasPendingTest(pending, a.id)
                return (
                  <div className="border-b px-4 py-3 last:border-b-0" key={a.id}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="min-w-0 flex-1 text-sm">{accountName(a)}</span>
                      <ConnectionPill account={a} pending={testing} />
                      {/* An unassigned terminal is the normal state for a new
                          account, not a fault: the worker claims one on the first
                          successful connection test. */}
                      {a.terminalPath
                        ? <span className="text-muted-foreground text-xs" title={a.terminalPath}>{terminalFolder(a.terminalPath)}</span>
                        : <span className="text-muted-foreground text-xs">terminal not assigned yet</span>}
                      {/* Round trip to this broker's trade server. Copy latency
                          cannot go below it, so a broker that is simply far away
                          looks completely different here from one where the
                          copier itself is slow. */}
                      {a.brokerPingMs !== null && (
                        <span
                          className="text-muted-foreground text-xs"
                          title="Round trip to this broker's trade server. Copy latency cannot go below it."
                        >
                          {a.brokerPingMs} ms to broker
                        </span>
                      )}
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button disabled={testing} onClick={() => handleTestConnection(a)} size="xs" variant="outline">
                          {testing ? 'Testing…' : 'Retest'}
                        </Button>
                        <Button
                          onClick={() => setJournallingAccount(a)}
                          size="xs"
                          title={a.journalAccountId
                            ? 'Closed trades from this account are journalled to the dashboard'
                            : 'Send this account\u2019s closed trades to the dashboard'}
                          variant={a.journalAccountId ? 'secondary' : 'outline'}
                        >
                          {a.journalAccountId ? 'Journalling' : 'Journal trades'}
                        </Button>
                        <Button onClick={() => setFixingAccount(a)} size="xs" variant="ghost">
                          Fix credentials
                        </Button>
                        <Button onClick={() => handleRemoveAccount(a)} size="xs" variant="destructive">
                          Remove
                        </Button>
                      </div>
                    </div>
                    {/* The worker writes the broker's own words here when a test
                        fails. It was previously a `title` tooltip only, which is
                        invisible on touch and easy to miss — so "Login rejected"
                        arrived with no reason attached. */}
                    {!testing && a.lastError && (
                      <p className="mt-1.5 text-(--critical-deep) text-xs">{a.lastError}</p>
                    )}
                    {testing && !workerOnline && (
                      <p className="mt-1.5 text-(--critical-deep) text-xs">
                        Queued, but no worker is online to run it.
                      </p>
                    )}
                  </div>
                )
              })}
            </CardContent></Card>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">Risk profiles</h2>
        {riskProfiles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No risk profiles yet — one is created per account when you set loss limits on it.
          </p>
        ) : (
          <Card className="gap-0 py-0"><CardContent className="px-0">
            {riskProfiles.map((p) => {
              const account = accounts.find((a) => a.id === p.accountId)
              return (
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-b-0"
                  key={p.id}
                >
                  <span className="min-w-0 flex-1 text-sm">
                    {account ? accountName(account) : 'deleted account'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {p.maxDailyLoss !== null ? `daily loss cap ${money(p.maxDailyLoss)}` : 'no daily cap'}
                    {' · '}
                    {p.dailyTradesCount} trade{p.dailyTradesCount === 1 ? '' : 's'} today
                  </span>
                  <Badge
                    style={{
                      background: `color-mix(in srgb, ${p.isLocked ? 'var(--critical)' : 'var(--good)'} 15%, transparent)`,
                      color: p.isLocked ? 'var(--critical-deep)' : 'var(--good-deep)',
                    }}
                    variant="secondary"
                  >
                    {p.isLocked ? (p.lockedReason || 'locked') : 'active'}
                  </Badge>
                  {p.isLocked && (
                    <Button onClick={() => handleUnlock(p)} size="xs" variant="outline">Unlock</Button>
                  )}
                </div>
              )
            })}
          </CardContent></Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">Copy log</h2>
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
    <div className="flex flex-col gap-5">
      <PageHeader
        description="Mirror one account's orders onto others. Each follower can size its own way — a multiplier, a fixed lot, an equity ratio or a percent of risk."
        title="Trade Copier"
      />

      {!user ? (
        <>
          <p className="text-muted-foreground text-sm">Sign in to manage trade copiers.</p>
          <AuthPage />
        </>
      ) : (
        <TradeCopierWorkspace userId={user.id} onAccountsChanged={onAccountsChanged} />
      )}
    </div>
  )
}
