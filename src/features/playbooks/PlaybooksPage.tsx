import { useEffect, useState } from 'react'
import type { Playbook, PlaybookExample, PlaybookGrade, Trade } from '../../types'
import { listPlaybooks, deletePlaybook } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { PlaybookFormDialog } from './components/PlaybookFormDialog'
import { PlaybookDetailDialog } from './components/PlaybookDetailDialog'
import styles from './PlaybooksPage.module.css'
import { errorMessage } from '../../utils/errors'
import { computePlaybookStats, playbookLinkedTrades } from './playbookStats'
import { useConfirm } from '../../shared/ui/confirm'

const GRADE_CLASS: Record<PlaybookGrade, string> = {
  'A+': styles.gradeAPlus,
  A: styles.gradeA,
  B: styles.gradeB,
  C: styles.gradeC,
}

const CARD_ACCENT_CLASS: Record<PlaybookGrade, string> = {
  'A+': styles.cardAPlus,
  A: styles.cardA,
  B: styles.cardB,
  C: styles.cardC,
}

function fmtPnl(v: number): string {
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}`
}

function fmtR(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}R`
}

export function PlaybooksPage({ trades, userId }: { trades: Trade[]; userId: string }) {
  const confirm = useConfirm()
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [examples, setExamples] = useState<PlaybookExample[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [viewing, setViewing] = useState<Playbook | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const [p, e] = await Promise.all([listPlaybooks(), listPlaybookExamples()])
    setPlaybooks(p)
    setExamples(e)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this playbook?', description: 'All of its examples are deleted too.', confirmLabel: 'Delete', destructive: true }))) return
    setError(null)
    try {
      await deletePlaybook(id)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>

  return (
    <div>
      <div className={styles.header}>
        <h1 className="page-title">Playbooks</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ New Playbook</button>
      </div>

      {error && <div style={{ color: 'var(--critical)', marginBottom: '1rem' }}>{error}</div>}

      {playbooks.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No playbooks yet. Add your first setup to start building a library.</p>
      ) : (
        <div className={styles.grid}>
          {playbooks.map((p) => {
            const playbookExamples = examples.filter((e) => e.playbookId === p.id)
            const previewExample = playbookExamples.find((e) => e.imageUrl) ?? playbookExamples[0]
            const linkedTrades = playbookLinkedTrades(p.id!, examples, trades)
            const stats = computePlaybookStats(linkedTrades)
            return (
              <div
                key={p.id}
                className={`${styles.card} ${p.grade ? CARD_ACCENT_CLASS[p.grade] : ''}`}
                onClick={() => setViewing(p)}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{p.name}</span>
                  {p.grade && <span className={`${styles.gradeBadge} ${GRADE_CLASS[p.grade]}`}>{p.grade}</span>}
                </div>
                {/* Description + stats on the left, one example image on the right — same
                    first-glance split as the detail dialog, so opening the card isn't required
                    just to see whether a setup has a chart example. */}
                <div className={styles.cardBody}>
                  <div className={styles.cardBodyLeft}>
                    {p.description && <p className={styles.cardDesc}>{p.description}</p>}

                    {stats.tradeCount > 0 ? (
                      <div className={styles.metricsRow}>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Win rate</div>
                          <div className={`${styles.metricValue} ${stats.winRatePct! >= 50 ? styles.metricGood : styles.metricBad}`}>
                            {stats.winRatePct!.toFixed(0)}%
                          </div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>Net P&amp;L</div>
                          <div className={`${styles.metricValue} ${stats.netPnl! >= 0 ? styles.metricGood : styles.metricBad}`}>
                            {fmtPnl(stats.netPnl!)}
                          </div>
                        </div>
                        <div className={styles.metric}>
                          <div className={styles.metricLabel}>R range</div>
                          <div className={styles.metricValue}>
                            {stats.minR !== null && stats.maxR !== null ? `${fmtR(stats.minR)} / ${fmtR(stats.maxR)}` : '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.metricEmpty}>Link trades to see performance metrics here.</p>
                    )}
                  </div>

                  {previewExample && (
                    <div className={styles.cardBodyRight}>
                      <div className={styles.cardExample}>
                        {previewExample.imageUrl ? (
                          <img src={previewExample.imageUrl} alt="Example" className={styles.cardExampleImage} />
                        ) : (
                          <p className={styles.cardExampleNote}>{previewExample.note}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <span>{playbookExamples.length} example{playbookExamples.length === 1 ? '' : 's'}</span>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditing(p)}>Edit</button>
                    <button onClick={() => handleDelete(p.id!)} className="btn-ghost">Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && <PlaybookFormDialog userId={userId} onClose={() => setAdding(false)} onSaved={refresh} />}
      {editing && <PlaybookFormDialog userId={userId} playbook={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {viewing && (
        <PlaybookDetailDialog
          playbook={viewing}
          examples={examples.filter((e) => e.playbookId === viewing.id)}
          trades={trades}
          userId={userId}
          onClose={() => setViewing(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}
