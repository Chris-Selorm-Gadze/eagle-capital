import { useEffect, useState } from 'react'
import type { ReportCard, ReportCardGrade, Trade } from '../../types'
import { listReportCards } from '../../db/reportCards'
import styles from './CompletedReportCardsPage.module.css'

const GRADE_CLASS: Record<ReportCardGrade, string> = {
  A: styles.gradeA,
  B: styles.gradeB,
  C: styles.gradeC,
  R: styles.gradeR,
}

const ROW_ACCENT_CLASS: Record<ReportCardGrade, string> = {
  A: styles.rowA,
  B: styles.rowB,
  C: styles.rowC,
  R: styles.rowR,
}

function dayOfWeekFor(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}

export function CompletedReportCardsPage({ trades, onOpen }: { trades: Trade[]; onOpen: (card: ReportCard) => void }) {
  const [cards, setCards] = useState<ReportCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listReportCards().then((c) => {
      setCards(c)
      setLoading(false)
    })
  }, [])

  const tradeById = new Map(trades.map((t) => [t.id, t]))

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  if (cards.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)' }}>
        No completed report cards yet — save one from the Daily Report Card tab to start tracking your progress.
      </p>
    )
  }

  return (
    <div>
      <div className={styles.count}>{cards.length} completed report card{cards.length === 1 ? '' : 's'}</div>
      <div className={styles.list}>
        {cards.map((c) => {
          const linked = (c.tradeIds ?? []).map((id) => tradeById.get(id)).filter((t): t is Trade => !!t)
          return (
            <div
              key={c.id}
              className={`${styles.row} ${c.grade ? ROW_ACCENT_CLASS[c.grade] : ''}`}
              onClick={() => onOpen(c)}
            >
              <div className={styles.rowBody}>
                <div className={styles.rowMain}>
                  <span className={styles.date}>{c.date}</span>
                  <span className={styles.dow}>{c.dayOfWeek ?? dayOfWeekFor(c.date)}</span>
                  {c.grade && <span className={`${styles.gradeBadge} ${GRADE_CLASS[c.grade]}`}>{c.grade}</span>}
                </div>
                <div className={styles.rowMeta}>
                  {c.instrument && <span>{c.instrument}</span>}
                  {c.session && <span>{c.session}</span>}
                  {c.tradesTaken != null && <span>{c.tradesTaken} trade{c.tradesTaken === 1 ? '' : 's'}</span>}
                  {c.netPnl && <span>Net {c.netPnl}</span>}
                </div>
                {linked.length > 0 && (
                  <div className={styles.rowTrades}>
                    {linked.map((t) => (
                      <span key={t.id} className={styles.tradeChip}>
                        {t.symbol} · {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className={styles.chevron}>›</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
