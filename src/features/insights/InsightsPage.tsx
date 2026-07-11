import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleExclamation, faStar, faLightbulb, faTrash,
  faTriangleExclamation, faCircleCheck, faArrowRight, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import type { Trade } from '../../types'
import { listReportCards } from '../../db/reportCards'
import { listPlaybooks } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { listAiInsights, saveAiInsight, deleteAiInsight, type AiInsight } from '../../db/aiInsights'
import { generateTradingInsights } from '../../lib/tradingInsightsClient'
import { buildInsightsPayload, rangeForPreset, type InsightsRangePreset } from './buildInsightsPayload'
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
            <div className={styles.findingEvidence}><span className={styles.findingEvidenceLabel}>Evidence</span> {f.evidence}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function InsightResultView({ insight }: { insight: AiInsight }) {
  return (
    <div>
      <div className={styles.summaryCard}>{insight.response.summary}</div>

      {insight.response.painPoints.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupTitle}>Pain Points</div>
          <FindingList items={insight.response.painPoints} kind="bad" />
        </div>
      )}
      {insight.response.strengths.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupTitle}>Strengths</div>
          <FindingList items={insight.response.strengths} kind="good" />
        </div>
      )}
      {insight.response.recommendations.length > 0 && (
        <div className={styles.group}>
          <div className={styles.groupTitle}>Recommendations</div>
          <FindingList items={insight.response.recommendations} kind="action" />
        </div>
      )}

      <p className={styles.meta}>
        Generated {insight.createdAt ? new Date(insight.createdAt).toLocaleString() : 'just now'} · {insight.model} · based
        on {insight.tradeCount} trade{insight.tradeCount === 1 ? '' : 's'}, {insight.reportCardCount} report card
        {insight.reportCardCount === 1 ? '' : 's'} over {RANGE_OPTIONS.find((r) => r.preset === insight.rangePreset)?.label ?? insight.rangePreset}
      </p>
    </div>
  )
}

export function InsightsPage({ trades, userId }: { trades: Trade[]; userId: string }) {
  const [reportCards, setReportCards] = useState<Awaited<ReturnType<typeof listReportCards>>>([])
  const [playbooks, setPlaybooks] = useState<Awaited<ReturnType<typeof listPlaybooks>>>([])
  const [playbookExamples, setPlaybookExamples] = useState<Awaited<ReturnType<typeof listPlaybookExamples>>>([])
  const [history, setHistory] = useState<AiInsight[]>([])
  const [loading, setLoading] = useState(true)

  const [rangePreset, setRangePreset] = useState<InsightsRangePreset>('last_30')
  const [current, setCurrent] = useState<AiInsight | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    const [cards, pbs, examples, insights] = await Promise.all([
      listReportCards(), listPlaybooks(), listPlaybookExamples(), listAiInsights(),
    ])
    setReportCards(cards)
    setPlaybooks(pbs)
    setPlaybookExamples(examples)
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
      const payload = buildInsightsPayload(trades, reportCards, playbooks, playbookExamples, range)
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
        never automatic, since each generation calls Claude's API. Nothing is analyzed until you
        click Generate.
      </p>

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

      <p className={styles.preview}>
        Will analyze {previewTradeCount} trade{previewTradeCount === 1 ? '' : 's'} and {previewCardCount} report card
        {previewCardCount === 1 ? '' : 's'} from {range.start} – {range.end}.
      </p>

      <div className={styles.generateRow}>
        <button type="button" className="btn-primary" onClick={handleGenerate} disabled={generating || previewTradeCount === 0}>
          <FontAwesomeIcon icon={faLightbulb} /> {generating ? 'Analyzing…' : 'Generate Insights'}
        </button>
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
