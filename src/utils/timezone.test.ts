import { describe, it, expect } from 'vitest'
import { zonedNaiveToUtcMs, utcMsToZonedDateStr } from './timezone'

describe('zonedNaiveToUtcMs', () => {
  it('converts an EDT (summer, UTC-4) naive time to the correct UTC instant', () => {
    // 2026-07-08 09:30:00 America/New_York == 13:30:00 UTC (EDT is UTC-4)
    const ms = zonedNaiveToUtcMs('2026-07-08 09:30:00', 'America/New_York')
    expect(new Date(ms).toISOString()).toBe('2026-07-08T13:30:00.000Z')
  })

  it('converts an EST (winter, UTC-5) naive time to the correct UTC instant', () => {
    // 2026-01-08 09:30:00 America/New_York == 14:30:00 UTC (EST is UTC-5)
    const ms = zonedNaiveToUtcMs('2026-01-08 09:30:00', 'America/New_York')
    expect(new Date(ms).toISOString()).toBe('2026-01-08T14:30:00.000Z')
  })
})

describe('utcMsToZonedDateStr', () => {
  it('renders a UTC instant as its America/New_York calendar date', () => {
    // 2026-01-01T02:00:00Z is still 2025-12-31 evening in New York
    const str = utcMsToZonedDateStr(Date.parse('2026-01-01T02:00:00Z'), 'America/New_York')
    expect(str).toBe('2025-12-31')
  })
})
