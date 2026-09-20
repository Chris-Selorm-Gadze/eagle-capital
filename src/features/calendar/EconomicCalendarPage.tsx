import { useEffect, useMemo, useState } from 'react'
import { fetchEconomicCalendar, type EconomicEvent } from '../../lib/economicCalendarClient'
import { currencyFlag, currencyLabel, CURRENCY_META } from './currencyMeta'
import { errorMessage } from '../../utils/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState, ErrorNotice, LoadingRows, PageHeader } from '@/shared/ui/page'
import { cn } from 'cn'
import { CalendarSearchIcon } from 'lucide-react'
import styles from './EconomicCalendarPage.module.css'

const IMPACT_LEVELS = ['High', 'Medium', 'Low'] as const
type ImpactLevel = (typeof IMPACT_LEVELS)[number]

/** The colour each impact level carries, straight from the semantic tokens —
 * a high-impact release is the same red as a breached limit elsewhere. */
const IMPACT_TONE: Record<string, string> = {
  High: 'var(--critical)',
  Medium: 'var(--warning)',
  Low: 'var(--text-muted)',
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

/** A filter toggle. `aria-pressed` rather than a styled-only active state — the
 * old chips carried no state in the accessibility tree at all, so a screen
 * reader read a row of identical buttons with no way to tell which were on. */
function FilterChip({
  active,
  children,
  onClick,
  title,
  tone,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  title?: string
  tone?: string
}) {
  return (
    <Button
      aria-pressed={active}
      className={cn('gap-1.5 rounded-full', !active && 'text-muted-foreground')}
      onClick={onClick}
      size="xs"
      style={
        active && tone
          ? {
              background: `color-mix(in srgb, ${tone} 16%, transparent)`,
              borderColor: tone,
              color: tone,
            }
          : undefined
      }
      title={title}
      variant={active ? 'secondary' : 'outline'}
    >
      {children}
    </Button>
  )
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
    <div className="flex flex-col gap-4">
      <PageHeader
        description="This week’s releases. Filter by how hard they hit, and by the currencies you actually trade."
        title="Economic Calendar"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {IMPACT_LEVELS.map((level) => (
          <FilterChip
            active={activeImpacts.has(level)}
            key={level}
            onClick={() => toggleImpact(level)}
            tone={IMPACT_TONE[level]}
          >
            {level}
          </FilterChip>
        ))}
        {countries.length > 0 && (
          <>
            <Separator className="mx-1 h-5" orientation="vertical" />
            {countries.map((code) => (
              <FilterChip
                active={!excludedCountries.has(code)}
                key={code}
                onClick={() => toggleCountry(code)}
                title={currencyLabel(code)}
              >
                <span aria-hidden>{currencyFlag(code)}</span> {code}
              </FilterChip>
            ))}
          </>
        )}
      </div>

      {loading ? (
        <LoadingRows rows={6} />
      ) : error ? (
        <ErrorNotice message={error} />
      ) : groups.length === 0 ? (
        <EmptyState
          description={
            events.length > 0
              ? 'Every release this week is filtered out. Turn a filter back on above.'
              : 'The feed returned nothing for this week.'
          }
          icon={<CalendarSearchIcon />}
          title="No events to show"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([key, dayEvents]) => (
            <Card className="gap-0 py-0" key={key}>
              <div className="border-b bg-muted/40 px-4 py-2 font-medium text-sm">
                {dayLabel(dayEvents[0].date)}
              </div>
              <CardContent className="px-0">
                {dayEvents.map((e, i) => (
                  <div
                    className={cn(styles.eventRow, 'border-b px-4 py-2.5 last:border-b-0')}
                    key={i}
                    // The impact rail. A 2px edge rather than a tinted row: a
                    // week of high-impact releases used to wash the whole list
                    // red, which made the severity impossible to read.
                    style={{ boxShadow: `inset 2px 0 0 ${IMPACT_TONE[e.impact] ?? 'transparent'}` }}
                  >
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {timeLabel(e.date)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span aria-hidden>{currencyFlag(e.country)}</span>
                      <span className="font-medium">{e.country}</span>
                    </div>
                    <div
                      className="font-semibold text-[0.65rem] uppercase tracking-wide"
                      style={{ color: IMPACT_TONE[e.impact] ?? 'var(--text-muted)' }}
                    >
                      {e.impact}
                    </div>
                    <div className="min-w-0 text-sm" title={currencyLabel(e.country)}>
                      {e.title}
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-muted-foreground">Forecast</span>
                      <span className="tabular-nums">{e.forecast || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-muted-foreground">Previous</span>
                      <span className="tabular-nums">{e.previous || '—'}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
