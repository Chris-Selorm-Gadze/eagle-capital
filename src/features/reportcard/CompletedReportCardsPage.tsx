import { useEffect, useState } from 'react'
import type { ReportCard, ReportCardGrade, Trade } from '../../types'
import { listReportCards } from '../../db/reportCards'
import { errorMessage } from '../../utils/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorNotice, LoadingRows } from '@/shared/ui/page'
import { ChevronRightIcon, ClockIcon } from 'lucide-react'

/* Converted onto shadcn Card + Badge.
 *
 * Also picks up a failure path it never had: `listReportCards()` was called with
 * no `.catch`, so a failed fetch left `loading` true forever and the tab sat on
 * "Loading…" with no explanation. */

const GRADE_TONE: Record<ReportCardGrade, string> = {
  A: 'var(--good)',
  B: 'var(--warning)',
  C: 'var(--serious)',
  R: 'var(--critical)',
}

function dayOfWeekFor(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}

export function CompletedReportCardsPage({
  trades,
  onOpen,
}: {
  trades: Trade[]
  onOpen: (card: ReportCard) => void
}) {
  const [cards, setCards] = useState<ReportCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    listReportCards()
      .then(setCards)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const tradeById = new Map(trades.map((t) => [t.id, t]))

  if (loading) return <LoadingRows rows={4} />
  if (error) return <ErrorNotice message={error} onRetry={load} />

  if (cards.length === 0) {
    return (
      <EmptyState
        description="Fill one in on the Daily Report Card tab and save it — they collect here so you can read back how a month went."
        icon={<ClockIcon />}
        title="No report cards filed yet"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        {cards.length} completed report card{cards.length === 1 ? '' : 's'}
      </p>

      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          {cards.map((c) => {
            const linked = (c.tradeIds ?? []).map((id) => tradeById.get(id)).filter((t): t is Trade => !!t)
            const tone = c.grade ? GRADE_TONE[c.grade] : undefined
            return (
              /* One button per row rather than a div driven by the `activate`
                 helper: the whole row opens the card, so the row should BE the
                 control, with the grade rail drawn on it. */
              <button
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                key={c.id}
                onClick={() => onOpen(c)}
                style={tone ? { boxShadow: `inset 3px 0 0 ${tone}` } : undefined}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="font-medium text-sm tabular-nums">{c.date}</span>
                    <span className="text-muted-foreground text-xs">
                      {c.dayOfWeek ?? dayOfWeekFor(c.date)}
                    </span>
                    {c.grade && (
                      <Badge
                        style={{
                          background: `color-mix(in srgb, ${tone} 15%, transparent)`,
                          color: tone,
                        }}
                        variant="secondary"
                      >
                        {c.grade}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                    {c.instrument && <span>{c.instrument}</span>}
                    {c.session && <span>{c.session}</span>}
                    {c.tradesTaken != null && (
                      <span>{c.tradesTaken} trade{c.tradesTaken === 1 ? '' : 's'}</span>
                    )}
                    {c.netPnl && <span>Net {c.netPnl}</span>}
                  </div>

                  {linked.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {linked.map((t) => (
                        <Badge className="font-normal" key={t.id} variant="outline">
                          {t.symbol} ·{' '}
                          <span
                            className="tabular-nums"
                            style={{
                              color: t.pnl >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)',
                            }}
                          >
                            {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
