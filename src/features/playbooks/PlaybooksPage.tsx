import { useEffect, useState } from 'react'
import type { Playbook, PlaybookExample, PlaybookGrade, Trade } from '../../types'
import { listPlaybooks, deletePlaybook } from '../../db/playbooks'
import { listPlaybookExamples } from '../../db/playbookExamples'
import { PlaybookFormDialog } from './components/PlaybookFormDialog'
import { PlaybookDetailDialog } from './components/PlaybookDetailDialog'
import { errorMessage } from '../../utils/errors'
import { computePlaybookStats, playbookLinkedTrades } from './playbookStats'
import { useConfirm } from '../../shared/ui/confirm'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorNotice, LoadingRows, PageHeader } from '@/shared/ui/page'
import { BookOpenIcon, PlusIcon } from 'lucide-react'
import styles from './PlaybooksPage.module.css'

/* Converted onto shadcn Card + Button + Badge.
 *
 * The grade accent is now one token lookup rather than eight module classes
 * (four for the badge, four for the card rail) that had drifted apart — the rail
 * and the badge were separately defined and no longer matched on every grade. */

const GRADE_TONE: Record<PlaybookGrade, string> = {
  'A+': 'var(--good)',
  A: 'var(--good)',
  B: 'var(--warning)',
  C: 'var(--critical)',
}

function fmtPnl(v: number): string {
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString()}`
}

function fmtR(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}R`
}

/** One of the three figures on a playbook card. */
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold text-sm tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  )
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
  const [loadError, setLoadError] = useState<string | null>(null)

  async function refresh() {
    const [p, e] = await Promise.all([listPlaybooks(), listPlaybookExamples()])
    setPlaybooks(p)
    setExamples(e)
  }

  // A failed load must not render as "no playbooks yet" — an empty state shown to
  // someone whose data merely failed to fetch is the worst thing this page can say.
  function load() {
    setLoading(true)
    setLoadError(null)
    refresh()
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (loading) return <LoadingRows rows={3} />
  if (loadError) return <ErrorNotice message={loadError} onRetry={load} />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button onClick={() => setAdding(true)} size="sm">
            <PlusIcon />
            New playbook
          </Button>
        }
        description="Your library of setups, each with its examples and how the trades linked to it actually did."
        title="Playbooks"
      />

      {error && <ErrorNotice message={error} />}

      {playbooks.length === 0 ? (
        <EmptyState
          action={{ label: 'New playbook', onClick: () => setAdding(true) }}
          description="Write up a setup once, attach chart examples, then link the trades you take from it."
          icon={<BookOpenIcon />}
          title="No playbooks yet"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playbooks.map((p) => {
            const playbookExamples = examples.filter((e) => e.playbookId === p.id)
            const previewExample = playbookExamples.find((e) => e.imageUrl) ?? playbookExamples[0]
            const linkedTrades = playbookLinkedTrades(p.id!, examples, trades)
            const stats = computePlaybookStats(linkedTrades)
            const tone = p.grade ? GRADE_TONE[p.grade] : undefined
            return (
              <Card
                className="gap-0 py-0"
                key={p.id}
                // The grade rail. An inset shadow rather than a border so it
                // can't shift the card's own 1px edge.
                style={tone ? { boxShadow: `inset 3px 0 0 ${tone}` } : undefined}
              >
                <CardHeader className="py-3">
                  {/* The whole card used to be one big click target via the
                      `activate` helper, with Edit and Delete inside it calling
                      stopPropagation. A nested interactive element inside another
                      is ambiguous to a screen reader and to a mouse — so the
                      title is the link now, and the two actions sit outside it. */}
                  <CardTitle className="min-w-0">
                    <button
                      className="truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                      onClick={() => setViewing(p)}
                      type="button"
                    >
                      {p.name}
                    </button>
                  </CardTitle>
                  {p.grade && (
                    <Badge
                      style={{
                        background: `color-mix(in srgb, ${tone} 15%, transparent)`,
                        color: tone,
                      }}
                      variant="secondary"
                    >
                      {p.grade}
                    </Badge>
                  )}
                </CardHeader>

                {/* Description + stats on the left, one example image on the right — same
                    first-glance split as the detail dialog, so opening the card isn't required
                    just to see whether a setup has a chart example. */}
                <CardContent className="flex flex-1 gap-3 py-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {p.description && (
                      <p className="line-clamp-3 text-muted-foreground text-sm">{p.description}</p>
                    )}

                    {stats.tradeCount > 0 ? (
                      <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2">
                        <Metric
                          label="Win rate"
                          tone={stats.winRatePct! >= 50 ? 'var(--good-deep)' : 'var(--critical-deep)'}
                          value={`${stats.winRatePct!.toFixed(0)}%`}
                        />
                        <Metric
                          label="Net P&L"
                          tone={stats.netPnl! >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)'}
                          value={fmtPnl(stats.netPnl!)}
                        />
                        <Metric
                          label="R range"
                          value={
                            stats.minR !== null && stats.maxR !== null
                              ? `${fmtR(stats.minR)} / ${fmtR(stats.maxR)}`
                              : '—'
                          }
                        />
                      </div>
                    ) : (
                      <p className="mt-auto text-muted-foreground text-xs">
                        Link trades to see performance metrics here.
                      </p>
                    )}
                  </div>

                  {previewExample && (
                    <div className={styles.preview}>
                      {previewExample.imageUrl ? (
                        <img
                          alt=""
                          className="size-full rounded-md object-cover"
                          src={previewExample.imageUrl}
                        />
                      ) : (
                        <p className="line-clamp-4 rounded-md bg-muted/60 p-2 text-muted-foreground text-xs">
                          {previewExample.note}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="mt-3 justify-between border-t py-2.5">
                  <span className="text-muted-foreground text-xs">
                    {playbookExamples.length} example{playbookExamples.length === 1 ? '' : 's'}
                  </span>
                  <div className="flex gap-1">
                    <Button onClick={() => setEditing(p)} size="xs" variant="ghost">Edit</Button>
                    <Button onClick={() => handleDelete(p.id!)} size="xs" variant="destructive">
                      Delete
                    </Button>
                  </div>
                </CardFooter>
              </Card>
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
