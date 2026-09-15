import { describe, it, expect } from 'vitest'
import { daysUntilPurge, RETENTION_DAYS } from './accountDeletion'

describe('daysUntilPurge', () => {
  const now = new Date('2026-09-11T12:00:00Z')

  it('counts whole days remaining', () => {
    expect(daysUntilPurge('2026-10-11T12:00:00Z', now)).toBe(30)
    expect(daysUntilPurge('2026-09-12T12:00:00Z', now)).toBe(1)
  })

  it('rounds a part-day up, so "1 day left" never displays while time remains', () => {
    expect(daysUntilPurge('2026-09-12T06:00:00Z', now)).toBe(1)
    expect(daysUntilPurge('2026-09-11T18:00:00Z', now)).toBe(1)
  })

  it('floors at zero once the window has passed', () => {
    expect(daysUntilPurge('2026-09-10T12:00:00Z', now)).toBe(0)
    expect(daysUntilPurge('2026-09-11T12:00:00Z', now)).toBe(0)
  })

  it('keeps the advertised window at 30 days', () => {
    // The retention constant is shown to users in Settings and must match the
    // interval defaulted in supabase/schema.sql.
    expect(RETENTION_DAYS).toBe(30)
  })
})
