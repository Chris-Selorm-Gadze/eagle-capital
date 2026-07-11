import { useEffect, useMemo, useState } from 'react'
import { fetchEconomicCalendar, type EconomicEvent } from '../../lib/economicCalendarClient'
import { currencyFlag, currencyLabel } from './currencyMeta'
import { errorMessage } from '../../utils/errors'
import styles from './EconomicCalendarPage.module.css'

const IMPACT_LEVELS = ['High', 'Medium', 'Low'] as const
type ImpactLevel = (typeof IMPACT_LEVELS)[number]

const IMPACT_CLASS: Record<string, string> = {
  High: styles.impactHigh,
  Medium: styles.impactMedium,
  Low: styles.impactLow,
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString()
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function EconomicCalendarPage() {
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usOnly, setUsOnly] = useState(true)
  const [activeImpacts, setActiveImpacts] = useState<Set<ImpactLevel>>(new Set(IMPACT_LEVELS))

  useEffect(() => {
    fetchEconomicCalendar()
      .then(setEvents)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  function toggleImpact(level: ImpactLevel) {
    setActiveImpacts((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  const filtered = useMemo(() => {
    return events
      .filter((e) => !usOnly || e.country === 'USD')
      .filter((e) => activeImpacts.has(e.impact as ImpactLevel) || !IMPACT_LEVELS.includes(e.impact as ImpactLevel))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [events, usOnly, activeImpacts])

  const groups = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>()
    for (const e of filtered) {
      const key = dayKey(e.date)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '0.4rem' }}>Economic Calendar</h1>
      <p className={styles.hint}>
        This week's releases, fetched as real structured data (not an embed) so it can be filtered
        and themed. One limitation of this free feed: it never carries the actual printed value,
        only the forecast and previous — flag it against your Trade Journal manually if a release
        moved your trade.
      </p>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.filterChip} ${usOnly ? styles.filterChipActive : ''}`}
          onClick={() => setUsOnly((v) => !v)}
        >
          🇺🇸 US only
        </button>
        <div className={styles.chipDivider} />
        {IMPACT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`${styles.filterChip} ${IMPACT_CLASS[level]} ${activeImpacts.has(level) ? styles.filterChipActive : ''}`}
            onClick={() => toggleImpact(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : error ? (
          <p style={{ color: 'var(--critical)' }}>{error}</p>
        ) : groups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No events match these filters this week.</p>
        ) : (
          groups.map(([key, dayEvents]) => (
            <div key={key} className={styles.dayGroup}>
              <div className={styles.dayHeader}>{dayLabel(dayEvents[0].date)}</div>
              {dayEvents.map((e, i) => (
                <div key={i} className={`${styles.eventRow} ${IMPACT_CLASS[e.impact] ?? ''}`}>
                  <div className={styles.eventTime}>{timeLabel(e.date)}</div>
                  <div className={styles.eventCurrency}>
                    <span>{currencyFlag(e.country)}</span>
                    <span>{e.country}</span>
                  </div>
                  <div className={`${styles.impactBadge} ${IMPACT_CLASS[e.impact] ?? ''}`}>{e.impact}</div>
                  <div className={styles.eventTitle} title={currencyLabel(e.country)}>{e.title}</div>
                  <div className={styles.eventStat}>
                    <span className={styles.eventStatLabel}>Forecast</span>
                    <span>{e.forecast || '—'}</span>
                  </div>
                  <div className={styles.eventStat}>
                    <span className={styles.eventStatLabel}>Previous</span>
                    <span>{e.previous || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
