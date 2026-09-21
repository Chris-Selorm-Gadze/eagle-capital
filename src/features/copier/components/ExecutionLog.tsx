import { useEffect, useMemo, useState } from 'react'
import { latencySummary, type ExecutionEvent, type ExecutionStatus, type TradingAccount } from '../../../db/copier'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import styles from './ExecutionLog.module.css'

/* The filter row and pager converted onto shadcn controls — the outcome tabs
 * already carried `aria-pressed`, which is more than most of this app's
 * hand-rolled chip groups did, so they keep their behaviour and gain the button
 * styling everything else now uses. */

/* The copy log — what the worker actually did, and how fast.
 *
 * This is the trust surface of the whole product. A copier that claims to mirror
 * trades is unfalsifiable without it; with it, a trader can point at a row and
 * see the master ticket, the follower ticket, the slippage and the milliseconds.
 * It is also where a latency regression shows up first, which is why the timing
 * summary sits above the rows rather than buried in a report.
 *
 * It is also the one surface here that grows without bound. The page loads the
 * last 200 attempts, and rendering all 200 in flow turned the log into the page:
 * everything else scrolled away above it, and finding the failure you came for
 * meant reading every success in between. So the rows now scroll inside their own
 * box, one page at a time, behind a filter — the summary and the controls stay
 * put while you move through them. */

const STATUS_TONE: Record<ExecutionStatus, string> = {
  success: 'toneGood',
  closed: 'toneGood',
  modified: 'toneGood',
  partial: 'toneWarn',
  pending: 'toneWarn',
  skipped_risk: 'toneWarn',
  skipped_slippage: 'toneWarn',
  duplicate_ignored: 'toneMuted',
  failed: 'toneBad',
  rejected: 'toneBad',
}

/* The broker's own words for the row, which is NOT always an error.
 *
 * The worker stores the MT5 retcode comment in `error_message` whether the order
 * succeeded or not -- there is only one text column -- so a perfectly good copy
 * carried the comment "Request executed". Rendering that in red under a green
 * "Copied" pill said two opposite things about the same row.
 *
 * Colouring it by status fixed the contradiction but not the noise: on a copy
 * that worked there is nothing to explain, and "Request executed" under "Copied"
 * is a log line, not information. So a settled-good row drops the message
 * entirely (see `showsMessage`) and the remaining tones cover the rows where the
 * broker's wording is the whole point. */
const MESSAGE_TONE: Record<ExecutionStatus, string> = {
  success: 'msgGood',
  closed: 'msgGood',
  modified: 'msgGood',
  partial: 'msgWarn',
  pending: 'msgWarn',
  skipped_risk: 'msgWarn',
  skipped_slippage: 'msgWarn',
  duplicate_ignored: 'msgMuted',
  failed: 'msgBad',
  rejected: 'msgBad',
}

/** Statuses that need no explanation. The order went through; the broker's
 * retcode comment on it is our plumbing, not the trader's business. */
const SETTLED_GOOD: ReadonlySet<ExecutionStatus> = new Set<ExecutionStatus>(['success', 'closed', 'modified'])

function showsMessage(e: ExecutionEvent): boolean {
  return Boolean(e.errorMessage) && !SETTLED_GOOD.has(e.status)
}

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  success: 'Copied',
  closed: 'Closed',
  modified: 'Modified',
  partial: 'Partial fill',
  pending: 'In flight',
  skipped_risk: 'Blocked by risk',
  skipped_slippage: 'Slippage too high',
  duplicate_ignored: 'Duplicate',
  failed: 'Failed',
  rejected: 'Rejected by broker',
}

/* Filtering by the ten raw statuses would put a ten-item dropdown in front of a
 * question people actually ask in three: did it copy, did something stop it, or
 * did it break. */
type Outcome = 'all' | 'copied' | 'stopped' | 'failed'

const OUTCOME_TABS: { key: Outcome; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'copied', label: 'Copied' },
  { key: 'stopped', label: 'Stopped' },
  { key: 'failed', label: 'Failed' },
]

const OUTCOME_OF: Record<ExecutionStatus, Exclude<Outcome, 'all'>> = {
  success: 'copied',
  closed: 'copied',
  modified: 'copied',
  partial: 'copied',
  pending: 'stopped',
  skipped_risk: 'stopped',
  skipped_slippage: 'stopped',
  duplicate_ignored: 'stopped',
  failed: 'failed',
  rejected: 'failed',
}

const PAGE_SIZE = 25

function ms(value: number | null): string {
  return value === null ? '—' : `${value} ms`
}

/** Where the milliseconds went, when the worker reported it.
 *
 * A switch of 0 is worth stating rather than hiding: it is the confirmation that
 * an account has its own terminal, and the number people are trying to get to. */
function latencyBreakdown(e: ExecutionEvent): string | null {
  const parts: string[] = []
  if (e.orderMs !== null) parts.push(`broker ${e.orderMs}`)
  if (e.switchMs !== null) parts.push(`switch ${e.switchMs}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function accountLabel(accounts: TradingAccount[], id: string | null): string {
  if (!id) return '—'
  const a = accounts.find((x) => x.id === id)
  if (!a) return 'deleted account'
  return a.label || `${a.platform} · ${a.accountNumber}`
}

export function ExecutionLog({ events, accounts }: { events: ExecutionEvent[]; accounts: TradingAccount[] }) {
  const [outcome, setOutcome] = useState<Outcome>('all')
  const [followerId, setFollowerId] = useState('all')
  const [symbolQuery, setSymbolQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const needle = symbolQuery.trim().toUpperCase()
    return events.filter((e) => {
      if (outcome !== 'all' && OUTCOME_OF[e.status] !== outcome) return false
      if (followerId !== 'all' && e.followerAccountId !== followerId) return false
      if (needle) {
        const haystack = `${e.symbolFollower ?? ''} ${e.symbolMaster ?? ''}`.toUpperCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [events, outcome, followerId, symbolQuery])

  /* Narrowing the filter can leave you past the end of the result — on page 4 of
   * something that now has one page. Clamping on change keeps the rows visible
   * instead of showing an empty box over a non-empty count. */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])

  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  /* Timing is summarised over the FILTERED set, not all 200 events: with one
   * follower selected the useful median is that follower's, and a summary that
   * silently ignored the filter above it would contradict the rows below it. */
  const summary = latencySummary(filtered)

  /* Only accounts that actually appear as a follower in the loaded window — a
   * dropdown listing every connected account would offer choices that can only
   * ever return nothing. */
  const followerOptions = useMemo(() => {
    const ids = new Set(events.map((e) => e.followerAccountId).filter((id): id is string => Boolean(id)))
    return [...ids].map((id) => ({ id, label: accountLabel(accounts, id) })).sort((a, b) => a.label.localeCompare(b.label))
  }, [events, accounts])

  if (events.length === 0) {
    return (
      <p className={styles.empty}>
        No copy attempts recorded yet. Once a worker is running and a link is armed, every order it
        mirrors appears here with its timing.
      </p>
    )
  }

  const filtersActive = outcome !== 'all' || followerId !== 'all' || symbolQuery.trim() !== ''

  function resetFilters() {
    setOutcome('all')
    setFollowerId('all')
    setSymbolQuery('')
    setPage(0)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Typical copy</span>
          <span className={styles.statValue}>{ms(summary.medianE2eMs)}</span>
          <span className={styles.statNote}>master fill → follower fill</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Worst</span>
          <span className={styles.statValue}>{ms(summary.worstE2eMs)}</span>
          <span className={styles.statNote}>over {summary.samples} timed cop{summary.samples === 1 ? 'y' : 'ies'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Login switching</span>
          <span className={styles.statValue}>{ms(summary.medianSwitchMs)}</span>
          {/* The single most actionable number here: anything above zero means two
              accounts are sharing one MT5 install, and the worker is paying a
              login swap on every copy. */}
          <span className={styles.statNote}>
            {summary.medianSwitchMs === null || summary.medianSwitchMs === 0
              ? 'each account on its own terminal'
              : 'accounts share a terminal — give each its own install'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Success rate</span>
          <span className={styles.statValue}>
            {summary.successRate === null ? '—' : `${Math.round(summary.successRate * 100)}%`}
          </span>
          <span className={styles.statNote}>of attempts that settled</span>
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.outcomeTabs} role="group" aria-label="Filter by outcome">
          {OUTCOME_TABS.map((t) => (
            <Button
              aria-pressed={outcome === t.key}
              key={t.key}
              onClick={() => { setOutcome(t.key); setPage(0) }}
              size="xs"
              type="button"
              variant={outcome === t.key ? 'secondary' : 'ghost'}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {followerOptions.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs" htmlFor="log-follower">Follower</Label>
            <Select
              onValueChange={(v) => { setFollowerId(v); setPage(0) }}
              value={followerId}
            >
              <SelectTrigger className="h-8 w-44" id="log-follower" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All followers</SelectItem>
                {followerOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs" htmlFor="log-symbol">Symbol</Label>
          <Input
            className="h-8 w-32"
            id="log-symbol"
            onChange={(e) => { setSymbolQuery(e.target.value); setPage(0) }}
            placeholder="e.g. XAUUSD"
            type="search"
            value={symbolQuery}
          />
        </div>

        {filtersActive && (
          <Button onClick={resetFilters} size="sm" type="button" variant="ghost">
            Clear filters
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>
          No copy attempts match these filters. {events.length} attempt{events.length === 1 ? '' : 's'} loaded in total.
        </p>
      ) : (
        <>
          {/* max-height + its own scroll: the log is the longest thing on this
              page, and letting it push the page down meant the worker status,
              the copy groups and the account list all scrolled out of reach to
              read it. The header stays stuck to the top of this box so the
              columns are still named 20 rows in. */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Follower</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th className={styles.numCol}>Lot</th>
                  <th className={styles.numCol}>Slippage</th>
                  <th className={styles.numCol}>Latency</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e) => (
                  <tr key={e.id}>
                    <td className={styles.num}>{shortTime(e.createdAt)}</td>
                    <td>{accountLabel(accounts, e.followerAccountId)}</td>
                    <td>
                      {e.symbolFollower ?? e.symbolMaster ?? '—'}
                      {/* A mapped symbol is worth showing: XAUUSD on the master can be
                          GOLD.m on the follower, and a mismatch here is a real failure
                          mode people otherwise debug blind. */}
                      {e.symbolMaster && e.symbolFollower && e.symbolMaster !== e.symbolFollower && (
                        <span className={styles.mapped}> ← {e.symbolMaster}</span>
                      )}
                    </td>
                    <td>{e.side ?? '—'}</td>
                    <td className={styles.num}>{e.executedLot ?? e.requestedLot ?? '—'}</td>
                    <td className={styles.num}>{e.slippagePoints ?? '—'}</td>
                    <td className={styles.num}>
                      {ms(e.e2eMs)}
                      {/* The breakdown is the only thing that answers "why is this
                          broker slower than that one". order_ms is the broker round
                          trip -- a floor set by network distance, which no local
                          change can improve. switch_ms is a login swap, which
                          giving the account its own terminal removes entirely.
                          Without these, a slow copy is indistinguishable from a
                          badly configured one. */}
                      {latencyBreakdown(e) && (
                        <div className={styles.breakdown}>{latencyBreakdown(e)}</div>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.tone} ${styles[STATUS_TONE[e.status] ?? 'toneMuted']}`}>
                        {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                      {showsMessage(e) && (
                        <div className={`${styles.message} ${styles[MESSAGE_TONE[e.status] ?? 'msgMuted']}`}>
                          {e.errorMessage}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.pager}>
            <span className={styles.pagerCount}>
              {safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + pageRows.length} of {filtered.length}
              {filtersActive && ` matching (${events.length} loaded)`}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <Button disabled={safePage === 0} onClick={() => setPage(0)} size="xs" type="button" variant="outline">First</Button>
                <Button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} size="xs" type="button" variant="outline">Previous</Button>
                <span className="px-2 text-muted-foreground text-xs tabular-nums">Page {safePage + 1} of {pageCount}</span>
                <Button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} size="xs" type="button" variant="outline">Next</Button>
                <Button disabled={safePage >= pageCount - 1} onClick={() => setPage(pageCount - 1)} size="xs" type="button" variant="outline">Last</Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
