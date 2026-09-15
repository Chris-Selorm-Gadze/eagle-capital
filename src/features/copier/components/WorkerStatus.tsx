import { useEffect, useState } from 'react'
import { workerLiveness, heartbeatAgeSeconds, type WorkerNode, type WorkerLiveness } from '../../../db/copier'
import styles from './WorkerStatus.module.css'

/* Whether execution is actually happening.
 *
 * Every other number on the copier page is history: balances the worker last
 * pushed, links someone armed, trades that already copied. None of it tells a
 * trader whether the next order will be mirrored — only a recent heartbeat does.
 * A page that shows healthy-looking copy groups while the worker has been dead
 * for an hour is worse than one that shows nothing, because it reads as
 * confirmation. So this sits at the top, and it states the bad case plainly. */

function ageLabel(seconds: number | null): string {
  if (seconds === null) return 'never'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const LIVENESS_COPY: Record<WorkerLiveness, { label: string; className: string }> = {
  online: { label: 'Online', className: 'pillOnline' },
  stale: { label: 'Missed beats', className: 'pillStale' },
  offline: { label: 'Offline', className: 'pillOffline' },
}

function WorkerRow({ worker, now }: { worker: WorkerNode; now: Date }) {
  const liveness = workerLiveness(worker.lastHeartbeatAt, now)
  const copy = LIVENESS_COPY[liveness]
  const age = heartbeatAgeSeconds(worker.lastHeartbeatAt, now)

  return (
    <div className={styles.row}>
      <span className={`${styles.pill} ${styles[copy.className]}`}>{copy.label}</span>
      <span className={styles.name}>{worker.name}</span>
      {worker.region && <span className={styles.meta}>{worker.region}</span>}
      <span className={styles.meta}>
        {worker.activeSessions}/{worker.capacity} session{worker.capacity === 1 ? '' : 's'}
      </span>
      <span className={styles.beat}>Heartbeat {ageLabel(age)}</span>
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
    return <div className={styles.shell}><span className={styles.meta}>Checking worker fleet…</span></div>
  }

  if (workers.length === 0) {
    return (
      <div className={`${styles.shell} ${styles.shellBad}`}>
        <span className={`${styles.pill} ${styles.pillOffline}`}>No worker</span>
        <span className={styles.headline}>Nothing is executing trades.</span>
        <span className={styles.meta}>
          No worker has registered with the control plane, so armed copy links will not mirror anything.
          Start the Delta Engine worker on your Windows machine. Until then every account below reads
          <strong> Disconnected</strong> and <strong>Test connection</strong> has nothing to answer it —
          neither is a verdict on your credentials.
        </span>
      </div>
    )
  }

  const live = workers.filter((w) => workerLiveness(w.lastHeartbeatAt, now) === 'online')
  const allDown = live.length === 0

  return (
    <div className={`${styles.shell} ${allDown ? styles.shellBad : ''}`}>
      {allDown && (
        <span className={styles.headline}>
          {workers.length === 1 ? 'The worker is not responding.' : 'No worker is responding.'} Copying is stopped.
        </span>
      )}
      <div className={styles.rows}>
        {workers.map((w) => <WorkerRow key={w.id} worker={w} now={now} />)}
      </div>
    </div>
  )
}
