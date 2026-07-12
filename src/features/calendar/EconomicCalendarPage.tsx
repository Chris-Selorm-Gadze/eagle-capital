import { useEffect, useMemo, useState } from 'react'
import { fetchEconomicCalendar, type EconomicEvent } from '../../lib/economicCalendarClient'
import { currencyFlag, currencyLabel, CURRENCY_META } from './currencyMeta'
import { errorMessage } from '../../utils/errors'
import styles from './EconomicCalendarPage.module.css'

const IMPACT_LEVELS = ['High', 'Medium', 'Low'] as const
type ImpactLevel = (typeof IMPACT_LEVELS)[number]

const IMPACT_CLASS: Record<string, string> = {
  High: styles.impactHigh,
  Medium: styles.impactMedium,
  Low: styles.impactLow,
}

// Currency code doubles as the "country" and, for anyone trading that currency's pairs, the
// "instrument" axis too — e.g. filtering to just USD surfaces every release that can move
// EURUSD/USDJPY/etc. Known codes sort in this order first; anything the feed sends that isn't in
// our metadata map (see currencyMeta.ts) still shows up, just after the known ones.
const KNOWN_CURRENCY_ORDER = Object.keys(CURRENCY_META)

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
  const [activeImpacts, setActiveImpacts] = useState<Set<ImpactLevel>>(new Set(IMPACT_LEVELS))
  // Countries/instruments explicitly turned off — empty means "show every country", so newly
  // arriving currency codes (from a future feed change) show up by default instead of being
  // silently hidden until the user opts in.
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchEconomicCalendar()
      .then(setEvents)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const countries = useMemo(() => {
    const present = new Set(events.map((e) => e.country))
    return [...present].sort((a, b) => {
      const ai = KNOWN_CURRENCY_ORDER.indexOf(a)
      const bi = KNOWN_CURRENCY_ORDER.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [events])

  function toggleImpact(level: ImpactLevel) {
    setActiveImpacts((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  function toggleCountry(code: string) {
    setExcludedCountries((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const filtered = useMemo(() => {
    return events
      .filter((e) => activeImpacts.has(e.impact as ImpactLevel) || !IMPACT_LEVELS.includes(e.impact as ImpactLevel))
      .filter((e) => !excludedCountries.has(e.country))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [events, activeImpacts, excludedCountries])

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

      <div className={styles.toolbar}>
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
        {countries.length > 0 && (
          <>
            <div className={styles.chipDivider} />
            {countries.map((code) => (
              <button
                key={code}
                type="button"
                className={`${styles.filterChip} ${excludedCountries.has(code) ? '' : styles.filterChipActive}`}
                onClick={() => toggleCountry(code)}
                title={currencyLabel(code)}
              >
                {currencyFlag(code)} {code}
              </button>
            ))}
          </>
        )}
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
