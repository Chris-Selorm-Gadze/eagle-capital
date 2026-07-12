import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleExclamation, faStar, faLightbulb, faTrash,
  faTriangleExclamation, faCircleCheck, faArrowRight, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import type { Account, Trade } from '../../types'
import { listReportCards } from '../../db/reportCards'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { listTradingRules } from '../../db/tradingRules'
import { listAiInsights, saveAiInsight, deleteAiInsight, type AiInsight } from '../../db/aiInsights'
import { generateTradingInsights } from '../../lib/tradingInsightsClient'
import { buildInsightsPayload, rangeForPreset, type InsightsRangePreset } from './buildInsightsPayload'
import { detectTradePatterns } from '../../utils/tradePatterns'
import { errorMessage } from '../../utils/errors'
import { todayISO } from '../../db/sessions'
import styles from './InsightsPage.module.css'

const RANGE_OPTIONS: { preset: InsightsRangePreset; label: string }[] = [
  { preset: 'last_30', label: '30 days' },
  { preset: 'last_60', label: '60 days' },
  { preset: 'last_90', label: '90 days' },
  { preset: 'all_time', label: 'All-time' },
]

const KIND_ICON: Record<'bad' | 'good' | 'action', IconDefinition> = {
  bad: faTriangleExclamation, good: faCircleCheck, action: faArrowRight,
}

function FindingList({ items, kind }: { items: AiInsight['response']['painPoints']; kind: 'bad' | 'good' | 'action' }) {
  const iconClass = kind === 'bad' ? styles.findingIconBad : kind === 'good' ? styles.findingIconGood : styles.findingIconAction
  return (
    <div className={styles.findingList}>
      {items.map((f, i) => (
        <div key={i} className={styles.finding}>
          <span className={`${styles.findingIcon} ${iconClass}`}>
            <FontAwesomeIcon icon={KIND_ICON[kind]} />
          </span>
          <div className={styles.findingBody}>
            <div className={styles.findingTitle}>{f.title}</div>
            <div className={styles.findingDesc}>{f.description}</div>
            {/* Collapsed by default — the title+description is the actual insight; evidence is
                there to back it up if asked, not something that needs to be read every time. */}
            <details className={styles.evidenceDetails}>
              <summary>Evidence</summary>
              <p className={styles.findingEvidence}>{f.evidence}</p>
            </details>
          </div>
        </div>
      ))}
    </div>
  )
}

type FindingKind = 'painPoints' | 'strengths' | 'recommendations'

const FINDING_TABS: { key: FindingKind; label: string; kind: 'bad' | 'good' | 'action' }[] = [
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

  const active = FINDING_TABS.find((t) => t.key === activeTab)

  return (
    <div>
      <div className={styles.summaryCard}>{insight.response.summary}</div>

      {availableTabs.length > 0 && active && (
        <>
          <div className={styles.findingTabs}>
            {availableTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.findingTab} ${activeTab === t.key ? styles.findingTabActive : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label} <span className={styles.findingTabCount}>{insight.response[t.key].length}</span>
              </button>
            ))}
          </div>
          <FindingList items={insight.response[active.key]} kind={active.kind} />
        </>
      )}

      <p className={styles.meta}>
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
    <div className={styles.group}>
      <div className={styles.groupTitle}>Detected Patterns{total > 0 ? ` (${total})` : ''}</div>
      {total === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No revenge-trading, overtrading, or size-escalation patterns detected in your logged trades yet.
        </p>
      ) : (
        <div className={styles.compactFindingList}>
          {patterns.revengeTrades.map((f, i) => (
            <div key={`revenge-${i}`} className={styles.compactFinding}>
              <FontAwesomeIcon icon={faTriangleExclamation} className={styles.compactFindingIcon} />
              <span>
                <strong>Quick re-entry after a loss</strong> — on {accountLabel(f.accountId)}, {f.tradeSymbol} opened just{' '}
                {f.gapMinutes} min after a ${Math.abs(f.priorLoss).toLocaleString()} loss on {f.priorTradeSymbol}
                {f.sizeIncreasePct !== null && f.sizeIncreasePct > 0 ? ` (${f.sizeIncreasePct}% bigger than average)` : ''}.
              </span>
            </div>
          ))}
          {patterns.overtradingDays.map((f, i) => (
            <div key={`overtrading-${i}`} className={styles.compactFinding}>
              <FontAwesomeIcon icon={faTriangleExclamation} className={styles.compactFindingIcon} />
              <span>
                <strong>Unusually busy day</strong> — on {accountLabel(f.accountId)}, {f.date} had {f.tradeCount} trades
                {' '}({f.ratio}x your {f.averageDailyTradeCount}/day average).
              </span>
            </div>
          ))}
          {patterns.sizeEscalations.map((f, i) => (
            <div key={`escalation-${i}`} className={styles.compactFinding}>
              <FontAwesomeIcon icon={faTriangleExclamation} className={styles.compactFindingIcon} />
              <span>
                <strong>Size climbing through a losing streak</strong> — on {accountLabel(f.accountId)}, {f.streakLength} losses
                {' '}in a row on {f.symbol}, size grew from {f.startQty} to {f.endQty} ({f.increasePct}% more).
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function InsightsPage({ trades, accounts, userId }: { trades: Trade[]; accounts: Account[]; userId: string }) {
  const [reportCards, setReportCards] = useState<Awaited<ReturnType<typeof listReportCards>>>([])
  const [playbooks, setPlaybooks] = useState<Awaited<ReturnType<typeof listPlaybooks>>>([])
  const [playbookExamples, setPlaybookExamples] = useState<Awaited<ReturnType<typeof listPlaybookExamples>>>([])
  const [rules, setRules] = useState<Awaited<ReturnType<typeof listTradingRules>>>([])
  const [history, setHistory] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(true)

  const [rangePreset, setRangePreset] = useState<InsightsRangePreset>('last_30')
  const [current, setCurrent] = useState<AiInsight | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    const [cards, pbs, examples, userRules, insights] = await Promise.all([
      listReportCards(), listPlaybooks(), listPlaybookExamples(), listTradingRules(), listAiInsights(),
    ])
    setReportCards(cards)
    setPlaybooks(pbs)
    setPlaybookExamples(examples)
    setRules(userRules)
    setHistory(insights)
    if (!current && insights[0]) setCurrent(insights[0])
  }

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
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
      const id = await saveAiInsight(userId, insight)
      insight.id = id
      insight.createdAt = new Date().toISOString()
      setCurrent(insight)
      setHistory((h) => [insight, ...h])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this insights digest?')) return
    await deleteAiInsight(id)
    setHistory((h) => h.filter((i) => i.id !== id))
    if (current?.id === id) setCurrent(null)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  return (
    <div className={styles.root}>
      <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>AI Insights</h1>
      <p className={styles.hint}>
        On-demand coaching digest generated from your own trades, report cards, and playbooks —
        never automatic. Nothing is analyzed until you click Generate.
      </p>

      <div className={`card ${styles.resultCard}`}>
        <DetectedPatternsSection trades={trades} accounts={accounts} />
      </div>

      <div className={styles.toolbar}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.preset}
            type="button"
            className={`${styles.rangeChip} ${rangePreset === opt.preset ? styles.rangeChipActive : ''}`}
            onClick={() => setRangePreset(opt.preset)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className={styles.generateRow}>
        <button type="button" className="btn-primary" onClick={handleGenerate} disabled={generating || previewTradeCount === 0}>
          <FontAwesomeIcon icon={faLightbulb} /> {generating ? 'Analyzing…' : 'Generate Insights'}
        </button>
        <span className={styles.preview}>
          {previewTradeCount} trade{previewTradeCount === 1 ? '' : 's'} · {previewCardCount} report card{previewCardCount === 1 ? '' : 's'}
          {' '}· {range.start} – {range.end}
        </span>
        {error && <span className={styles.error}><FontAwesomeIcon icon={faCircleExclamation} /> {error}</span>}
      </div>

      {current && (
        <div className={`card ${styles.resultCard}`}>
          <InsightResultView insight={current} />
        </div>
      )}

      {history.length > 0 && (
        <div className={styles.historySection}>
          <div className={styles.historyTitle}>Past digests</div>
          <div className={styles.list}>
            {history.map((i) => (
              <div key={i.id} className={`${styles.row} ${current?.id === i.id ? styles.rowActive : ''}`} onClick={() => setCurrent(i)}>
                <div className={styles.rowBody}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowDate}>{i.createdAt ? new Date(i.createdAt).toLocaleDateString() : ''}</span>
                    <span className={styles.rowRange}>
                      {RANGE_OPTIONS.find((r) => r.preset === i.rangePreset)?.label ?? i.rangePreset} · {i.tradeCount} trades
                    </span>
                  </div>
                  <div className={styles.rowSummary}>{i.response.summary}</div>
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); handleDelete(i.id!) }}
                  title="Delete this digest"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {history.length === 0 && !current && (
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
          <FontAwesomeIcon icon={faStar} /> No digests yet — pick a range above and click Generate Insights.
        </p>
      )}
    </div>
  )
}
