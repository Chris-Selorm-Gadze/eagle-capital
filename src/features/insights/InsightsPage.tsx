import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightIcon, CircleCheckIcon, LightbulbIcon, SparklesIcon,
  Trash2Icon, TriangleAlertIcon,
} from 'lucide-react'
import type { Account, Trade } from '../../types'
import { listReportCards } from '../../db/reportCards'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { listTradingRules } from '../../db/tradingRules'
import { listAiInsights, saveAiInsight, deleteAiInsight, getInsightsUsage, type AiInsight } from '../../db/aiInsights'
import { generateTradingInsights } from '../../lib/tradingInsightsClient'
import { buildInsightsPayload, rangeForPreset, type InsightsRangePreset } from './buildInsightsPayload'
import { detectTradePatterns } from '../../utils/tradePatterns'
import { errorMessage } from '../../utils/errors'
import { todayISO } from '../../db/sessions'
import { useConfirm } from '../../shared/ui/confirm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorNotice, LoadingRows, PageHeader } from '@/shared/ui/page'
import { cn } from 'cn'
import styles from './InsightsPage.module.css'

/* Converted onto shadcn Card + Tabs + Button, and off FontAwesome onto lucide —
 * this page was the heaviest FontAwesome user in the app, and the only reason
 * the library was in the Insights chunk at all.
 *
 * Two hand-rolled tab strips (the finding categories, the range chips) become
 * Radix Tabs and a real toggle group, so both carry keyboard navigation and
 * pressed state that assistive tech can read. Their `.rangeChipActive` and
 * `.findingTabActive` classes were among those theme.css's element floor was
 * overriding, so every chip in each group rendered identically. */

const RANGE_OPTIONS: { preset: InsightsRangePreset; label: string }[] = [
  { preset: 'last_30', label: '30 days' },
  { preset: 'last_60', label: '60 days' },
  { preset: 'last_90', label: '90 days' },
  { preset: 'all_time', label: 'All-time' },
]

const KIND = {
  bad: { Icon: TriangleAlertIcon, tone: 'var(--critical)' },
  good: { Icon: CircleCheckIcon, tone: 'var(--good)' },
  action: { Icon: ArrowRightIcon, tone: 'var(--data-accent)' },
} as const

function FindingList({
  items,
  kind,
}: {
  items: AiInsight['response']['painPoints']
  kind: keyof typeof KIND
}) {
  const { Icon, tone } = KIND[kind]
  return (
    <div className="flex flex-col gap-3">
      {items.map((f, i) => (
        <div className="flex gap-3" key={i}>
          <span
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5"
            style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}
          >
            <Icon />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-sm">{f.title}</div>
            <div className="mt-0.5 text-muted-foreground text-sm">{f.description}</div>
            {/* Collapsed by default — the title+description is the actual insight; evidence is
                there to back it up if asked, not something that needs to be read every time. */}
            <details className={styles.evidence}>
              <summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
                Evidence
              </summary>
              <p className="mt-1.5 border-l-2 pl-2.5 text-muted-foreground text-xs">{f.evidence}</p>
            </details>
          </div>
        </div>
      ))}
    </div>
  )
}

type FindingKind = 'painPoints' | 'strengths' | 'recommendations'

const FINDING_TABS: { key: FindingKind; label: string; kind: keyof typeof KIND }[] = [
  { key: 'painPoints', label: 'Pain Points', kind: 'bad' },
  { key: 'strengths', label: 'Strengths', kind: 'good' },
  { key: 'recommendations', label: 'Recommendations', kind: 'action' },
]

function InsightResultView({ insight }: { insight: AiInsight }) {
  const availableTabs = FINDING_TABS.filter((t) => insight.response[t.key].length > 0)
  // One category visible at a time instead of all three stacked — the same information, just
  // not all displayed as one long scroll of text.
  const [activeTab, setActiveTab] = useState<FindingKind>(availableTabs[0]?.key ?? 'painPoints')

  useEffect(() => {
    setActiveTab(availableTabs[0]?.key ?? 'painPoints')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight.id])

  return (
    <div className="flex flex-col gap-4">
      <p className="border-l-2 border-l-(--data-accent) bg-muted/40 py-2.5 pr-3 pl-3.5 text-sm">
        {insight.response.summary}
      </p>

      {availableTabs.length > 0 && (
        <Tabs onValueChange={(v) => setActiveTab(v as FindingKind)} value={activeTab}>
          <TabsList>
            {availableTabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                <Badge className="ml-1.5 px-1 py-0 text-[0.65rem]" variant="secondary">
                  {insight.response[t.key].length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {availableTabs.map((t) => (
            <TabsContent className="pt-3" key={t.key} value={t.key}>
              <FindingList items={insight.response[t.key]} kind={t.kind} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <p className="text-muted-foreground text-xs">
        Generated {insight.createdAt ? new Date(insight.createdAt).toLocaleString() : 'just now'} · {insight.model} · based
        on {insight.tradeCount} trade{insight.tradeCount === 1 ? '' : 's'}, {insight.reportCardCount} report card
        {insight.reportCardCount === 1 ? '' : 's'} over {RANGE_OPTIONS.find((r) => r.preset === insight.rangePreset)?.label ?? insight.rangePreset}
      </p>
    </div>
  )
}

/** Free, instant, deterministic — computed straight from the trade log, no Claude call and no
 * button press. Distinct from the AI digest below: those are one-off, paid, and narrative;
 * these are objective signals (quick re-entry after a loss, an unusually busy day, size climbing
 * through a losing streak) that stay current as soon as a new trade is logged. */
function DetectedPatternsSection({ trades, accounts }: { trades: Trade[]; accounts: Account[] }) {
  const patterns = useMemo(() => detectTradePatterns(trades), [trades])
  const total = patterns.revengeTrades.length + patterns.overtradingDays.length + patterns.sizeEscalations.length
  const accountLabel = (accountId: string) => accounts.find((a) => a.id === accountId)?.label ?? 'this account'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Detected patterns
          {total > 0 && <Badge variant="secondary">{total}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">
            No revenge-trading, overtrading, or size-escalation patterns detected in your logged trades yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {patterns.revengeTrades.map((f, i) => (
              <PatternRow key={`revenge-${i}`}>
                <strong>Quick re-entry after a loss</strong> — on {accountLabel(f.accountId)}, {f.tradeSymbol} opened just{' '}
                {f.gapMinutes} min after a ${Math.abs(f.priorLoss).toLocaleString()} loss on {f.priorTradeSymbol}
                {f.sizeIncreasePct !== null && f.sizeIncreasePct > 0 ? ` (${f.sizeIncreasePct}% bigger than average)` : ''}.
              </PatternRow>
            ))}
            {patterns.overtradingDays.map((f, i) => (
              <PatternRow key={`overtrading-${i}`}>
                <strong>Unusually busy day</strong> — on {accountLabel(f.accountId)}, {f.date} had {f.tradeCount} trades
                {' '}({f.ratio}x your {f.averageDailyTradeCount}/day average).
              </PatternRow>
            ))}
            {patterns.sizeEscalations.map((f, i) => (
              <PatternRow key={`escalation-${i}`}>
                <strong>Size climbing through a losing streak</strong> — on {accountLabel(f.accountId)}, {f.streakLength} losses
                {' '}in a row on {f.symbol}, size grew from {f.startQty} to {f.endQty} ({f.increasePct}% more).
              </PatternRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Every detected pattern is a caution, so they all carry the same mark. */
function PatternRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-(--warning)" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** Mirrors INSIGHTS_DAILY_LIMIT in the Edge Function. Display only — the
 * server is what actually enforces it. */
const DAILY_LIMIT = 10

export function InsightsPage({ trades, accounts, userId }: { trades: Trade[]; accounts: Account[]; userId: string }) {
  const confirm = useConfirm()
  const [reportCards, setReportCards] = useState<Awaited<ReturnType<typeof listReportCards>>>([])
  const [playbooks, setPlaybooks] = useState<Awaited<ReturnType<typeof listPlaybooks>>>([])
  const [playbookExamples, setPlaybookExamples] = useState<Awaited<ReturnType<typeof listPlaybookExamples>>>([])
  const [rules, setRules] = useState<Awaited<ReturnType<typeof listTradingRules>>>([])
  const [history, setHistory] = useState<AiInsight[]>([])
  // Generations are metered server-side (see supabase/functions/trading-insights).
  // Showing the remaining count means the limit is visible before it bites.
  const [usedToday, setUsedToday] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [rangePreset, setRangePreset] = useState<InsightsRangePreset>('last_30')
  const [current, setCurrent] = useState<AiInsight | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    const [cards, pbs, examples, userRules, insights, used] = await Promise.all([
      listReportCards(), listPlaybooks(), listPlaybookExamples(), listTradingRules(), listAiInsights(),
      getInsightsUsage().catch(() => null),
    ])
    setUsedToday(used)
    setReportCards(cards)
    setPlaybooks(pbs)
    setPlaybookExamples(examples)
    setRules(userRules)
    setHistory(insights)
    if (!current && insights[0]) setCurrent(insights[0])
  }

  useEffect(() => {
    loadAll()
      .then(() => setLoadError(null))
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const range = rangeForPreset(rangePreset, todayISO())
  const previewTradeCount = trades.filter((t) => t.date >= range.start && t.date <= range.end).length
  const previewCardCount = reportCards.filter((c) => c.date >= range.start && c.date <= range.end).length

  async function handleGenerate() {
    setError(null)
    setGenerating(true)
    try {
      const payload = buildInsightsPayload(trades, reportCards, playbooks, playbookExamples, rules, range)
      const { model, insights } = await generateTradingInsights(payload)
      const insight: AiInsight = {
        rangeStart: range.start, rangeEnd: range.end, rangePreset,
        tradeCount: payload.meta.tradeCount, reportCardCount: payload.meta.reportCardCount,
        model, response: insights, requestPayload: payload,
      }
      // Built once, after the write, rather than mutating the object that was
      // sent — the saved row is the source of the id and the timestamp, so the
      // version that reaches state should be assembled from both at once.
      const saved: AiInsight = {
        ...insight,
        id: await saveAiInsight(userId, insight),
        createdAt: new Date().toISOString(),
      }
      setCurrent(saved)
      setHistory((h) => [saved, ...h])
      setUsedToday((n) => (n === null ? n : n + 1))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this insights digest?', confirmLabel: 'Delete', destructive: true }))) return
    await deleteAiInsight(id)
    setHistory((h) => h.filter((i) => i.id !== id))
    if (current?.id === id) setCurrent(null)
  }

  if (loading) return <LoadingRows rows={4} />
  if (loadError) {
    return (
      <ErrorNotice
        message={loadError}
        onRetry={() => {
          setLoading(true)
          setLoadError(null)
          loadAll()
            .catch((err) => setLoadError(errorMessage(err)))
            .finally(() => setLoading(false))
        }}
      />
    )
  }

  const remaining = usedToday === null ? null : Math.max(0, DAILY_LIMIT - usedToday)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        description="On-demand coaching digest generated from your own trades, report cards, and playbooks — never automatic. Nothing is analyzed until you press Generate."
        title="AI Insights"
      />

      <DetectedPatternsSection accounts={accounts} trades={trades} />

      <Card>
        <CardHeader>
          <CardTitle>Generate a digest</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* A radiogroup, not a row of independent buttons: exactly one range is
              active, and that is what a screen reader should be told. */}
          <div aria-label="Date range" className="flex flex-wrap gap-1.5" role="radiogroup">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                aria-checked={rangePreset === opt.preset}
                key={opt.preset}
                onClick={() => setRangePreset(opt.preset)}
                role="radio"
                size="xs"
                variant={rangePreset === opt.preset ? 'secondary' : 'outline'}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={generating || previewTradeCount === 0}
              onClick={handleGenerate}
            >
              <LightbulbIcon />
              {generating ? 'Analyzing…' : 'Generate insights'}
            </Button>
            <span className="text-muted-foreground text-xs">
              {previewTradeCount} trade{previewTradeCount === 1 ? '' : 's'} · {previewCardCount} report card{previewCardCount === 1 ? '' : 's'}
              {' '}· {range.start} – {range.end}
              {remaining !== null && <> · {remaining} of {DAILY_LIMIT} left today</>}
            </span>
          </div>

          {previewTradeCount === 0 && (
            <p className="text-muted-foreground text-xs">
              No trades in this range — pick a wider one, or log some trades first.
            </p>
          )}
          {error && <ErrorNotice message={error} />}
        </CardContent>
      </Card>

      {current && (
        <Card>
          <CardContent>
            <InsightResultView insight={current} />
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle>Past digests</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {history.map((i) => (
              <div
                className={cn(
                  'flex items-start gap-2 border-b px-4 py-3 last:border-b-0',
                  current?.id === i.id && 'bg-muted/60',
                )}
                key={i.id}
              >
                {/* A real button wrapping the row rather than a div with a click
                    handler — it was reachable only by the `activate` helper's
                    synthesised key handling before. */}
                <button
                  className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  onClick={() => setCurrent(i)}
                  type="button"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-sm tabular-nums">
                      {i.createdAt ? new Date(i.createdAt).toLocaleDateString() : ''}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {RANGE_OPTIONS.find((r) => r.preset === i.rangePreset)?.label ?? i.rangePreset} · {i.tradeCount} trades
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {i.response.summary}
                  </p>
                </button>
                <Button
                  aria-label="Delete this digest"
                  onClick={() => handleDelete(i.id!)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {history.length === 0 && !current && (
        <EmptyState
          description="Pick a range above and press Generate — it reads your own trades, report cards and playbooks."
          icon={<SparklesIcon />}
          title="No digests yet"
        />
      )}
    </div>
  )
}
