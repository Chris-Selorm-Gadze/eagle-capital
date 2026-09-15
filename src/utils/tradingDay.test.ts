import { describe, it, expect } from 'vitest'
import { tradingDayOf, todayTradingDay, formatLocalDate, parseLocalDate, addDays, weekdayOf } from './tradingDay'

describe('tradingDayOf', () => {
  // The bug this module exists for: the day was `toISOString().slice(0, 10)`,
  // i.e. the UTC date. The suite pins TZ=America/New_York (src/test-setup.ts),
  // so an evening fill here is already "tomorrow" in UTC — which is exactly the
  // case that used to misfile every US evening session.
  it('files an evening trade on the local day, not the UTC one', () => {
    const evening = new Date(2026, 0, 15, 20, 30) // Jan 15, 20:30 local
    expect(evening.toISOString().slice(0, 10)).toBe('2026-01-16') // the old answer
    expect(tradingDayOf(evening.toISOString())).toBe('2026-01-15') // the right one
  })

  it('handles an early-morning trade the same way', () => {
    const morning = new Date(2026, 6, 3, 1, 18)
    expect(tradingDayOf(morning.toISOString())).toBe('2026-07-03')
  })

  it('accepts a Date, a string or epoch millis', () => {
    const d = new Date(2026, 2, 9, 12, 0)
    expect(tradingDayOf(d)).toBe('2026-03-09')
    expect(tradingDayOf(d.toISOString())).toBe('2026-03-09')
    expect(tradingDayOf(d.getTime())).toBe('2026-03-09')
  })

  it('returns an empty string for an unparseable instant rather than "NaN-aN-aN"', () => {
    expect(tradingDayOf('not a date')).toBe('')
  })
})

describe('formatLocalDate / parseLocalDate', () => {
  it('pads single-digit months and days', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('round-trips', () => {
    expect(formatLocalDate(parseLocalDate('2026-11-30'))).toBe('2026-11-30')
  })

  // `new Date('2026-01-15')` is UTC midnight, which renders as the 14th anywhere
  // west of Greenwich — the reason date-only strings never go through the Date
  // constructor directly.
  it('parses a date-only string at local midnight, not UTC midnight', () => {
    const d = parseLocalDate('2026-01-15')
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
  })
})

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-03-09', 1)).toBe('2026-03-10')
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  // Adding 86_400_000ms across a DST change lands on the wrong day; setDate doesn't.
  it('stays correct across a DST transition', () => {
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02')
  })
})

describe('weekdayOf', () => {
  it('reports the local day of week', () => {
    expect(weekdayOf('2026-03-09')).toBe(1) // a Monday
    expect(weekdayOf('2026-03-08')).toBe(0) // the Sunday before
  })
})

describe('todayTradingDay', () => {
  it('matches the local calendar date', () => {
    expect(todayTradingDay()).toBe(formatLocalDate(new Date()))
  })
})
