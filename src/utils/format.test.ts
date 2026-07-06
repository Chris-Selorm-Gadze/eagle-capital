import { describe, it, expect } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('shows minutes under an hour', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(59)).toBe('59 min')
  })

  it('converts to hours at 60+ minutes', () => {
    expect(formatDuration(60)).toBe('1 hr')
    expect(formatDuration(65)).toBe('1 hr 5 min')
    expect(formatDuration(150)).toBe('2 hr 30 min')
  })

  it('rounds fractional minutes', () => {
    expect(formatDuration(64.6)).toBe('1 hr 5 min')
  })
})
