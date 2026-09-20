import { useEffect, useState } from 'react'
import { workerLiveness, heartbeatAgeSeconds, type WorkerNode, type WorkerLiveness } from '../../../db/copier'
import { Card, CardContent } from '@/components/ui/card'
import { StatusIndicator } from '@/components/indicator'
import { cn } from 'cn'

/* Whether execution is actually happening.
 *
 * Every other number on the copier page is history: balances the worker last
 * pushed, links someone armed, trades that already copied. None of it tells a
 * trader whether the next order will be mirrored — only a recent heartbeat does.
 * A page that shows healthy-looking copy groups while the worker has been dead
 * for an hour is worse than one that shows nothing, because it reads as
 * confirmation. So this sits at the top, and it states the bad case plainly.
 *
 * Converted onto shadcn Card and the shared StatusIndicator — the three liveness
 * states are now the same pulsing dot the Live Trading page uses for the same
 * idea, rather than three pill classes that only existed here. */

function ageLabel(seconds: number | null): string {
  if (seconds === null) return 'never'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const LIVENESS: Record<WorkerLiveness, { label: string; tone: 'good' | 'warning' | 'critical' }> = {
  online: { label: 'Online', tone: 'good' },
  stale: { label: 'Missed beats', tone: 'warning' },
  offline: { label: 'Offline', tone: 'critical' },
}

function WorkerRow({ worker, now }: { worker: WorkerNode; now: Date }) {
  const liveness = workerLiveness(worker.lastHeartbeatAt, now)
  const { label, tone } = LIVENESS[liveness]
  const age = heartbeatAgeSeconds(worker.lastHeartbeatAt, now)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <StatusIndicator pulse={liveness === 'online'} tone={tone} />
        <span className="text-xs" style={{ color: `var(--${tone === 'good' ? 'good' : tone})` }}>
          {label}
        </span>
      </span>
      <span className="font-medium">{worker.name}</span>
      {worker.region && <span className="text-muted-foreground text-xs">{worker.region}</span>}
      <span className="text-muted-foreground text-xs tabular-nums">
        {worker.activeSessions}/{worker.capacity} session{worker.capacity === 1 ? '' : 's'}
      </span>
      <span className="ml-auto text-muted-foreground text-xs">Heartbeat {ageLabel(age)}</span>
    </div>
  )
}

export function WorkerStatus({ workers, loading }: { workers: WorkerNode[]; loading: boolean }) {
  /* Re-render on a timer so "Heartbeat 12s ago" doesn't freeze at whatever it
   * said when the data arrived. The row would otherwise keep claiming a fresh
   * beat indefinitely while the worker was already gone. */
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <Card className="py-3">
        <CardContent className="text-muted-foreground text-xs">Checking worker fleet…</CardContent>
      </Card>
    )
  }

  const live = workers.filter((w) => workerLiveness(w.lastHeartbeatAt, now) === 'online')
  const allDown = workers.length > 0 && live.length === 0
  // The bad states get the critical edge. This is the one card on the page whose
  // colour is load-bearing: it is the difference between "your copies are
  // running" and "nothing is executing".
  const bad = workers.length === 0 || allDown

  return (
    <Card
      className={cn('py-3', bad && 'border-(--critical)/40 bg-(--critical)/5')}
    >
      <CardContent className="flex flex-col gap-2">
        {workers.length === 0 ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <StatusIndicator pulse={false} tone="critical" />
              <span className="font-semibold text-sm">Nothing is executing trades.</span>
            </span>
            <span className="text-muted-foreground text-xs">
              No worker has checked in, so armed copy links will not mirror anything. Start the Delta
              Engine worker on your Windows machine. Until then every account below reads
              <strong> Disconnected</strong> and <strong>Test connection</strong> has nothing to answer it —
              neither is a verdict on your credentials.
            </span>
          </>
        ) : (
          <>
            {allDown && (
              <span className="font-semibold text-sm">
                {workers.length === 1 ? 'The worker is not responding.' : 'No worker is responding.'} Copying is stopped.
              </span>
            )}
            <div className="flex flex-col gap-1.5">
              {workers.map((w) => <WorkerRow key={w.id} now={now} worker={w} />)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
