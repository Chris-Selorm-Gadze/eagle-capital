import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  formatLots,
  formatMoney,
  formatPnl,
  formatPrice,
  tickOf,
} from './ticker'

describe('tickOf', () => {
  it('reports the direction a number moved', () => {
    expect(tickOf(1.0850, 1.0852)).toBe('up')
    expect(tickOf(1.0852, 1.0850)).toBe('down')
    expect(tickOf(1.0850, 1.0850)).toBe('none')
  })

  it('does not flash on the first reading', () => {
    // Nothing moved — the page just arrived. Flashing every row on load
    // trains the eye to ignore the flash.
    expect(tickOf(null, 1.085)).toBe('none')
    expect(tickOf(undefined, 1.085)).toBe('none')
  })

  it('ignores values that are not numbers', () => {
    expect(tickOf(1.085, null)).toBe('none')
    expect(tickOf(NaN, 1.085)).toBe('none')
    expect(tickOf(1.085, Infinity)).toBe('none')
  })
})

describe('formatPrice', () => {
  it('shows a quote at the broker’s own precision', () => {
    expect(formatPrice(1.085, 5)).toBe('1.08500')
    expect(formatPrice(38150.5, 2)).toBe('38150.50')
  })

  it('pads rather than trims, so the column never shifts', () => {
    // 1.085 and 1.08512 must occupy the same width, or the number jitters
    // sideways on every tick.
    expect(formatPrice(1.085, 5)).toHaveLength(formatPrice(1.08512, 5).length)
  })

  it('falls back to five places when the worker could not read digits', () => {
    // Over-stating precision on an index is survivable; hiding a pip on a
    // currency pair is not.
    expect(formatPrice(1.085, null)).toBe('1.08500')
  })

  it('rejects a nonsense precision rather than throwing', () => {
    // toFixed throws outside 0–100, and a bad digits value must not blank the page.
    expect(formatPrice(1.085, -1)).toBe('1.08500')
    expect(formatPrice(1.085, 99)).toBe('1.08500')
  })

  it('shows an absent price as a dash', () => {
    expect(formatPrice(null, 5)).toBe('—')
  })
})

describe('formatPnl', () => {
  it('always signs and always shows cents', () => {
    expect(formatPnl(30)).toBe('+30.00')
    expect(formatPnl(-12.5)).toBe('−12.50')
  })

  it('leaves zero unsigned', () => {
    expect(formatPnl(0)).toBe('0.00')
  })

  it('uses a real minus sign, which aligns with digits', () => {
    // ASCII hyphen is narrower than a digit and breaks a tabular column.
    expect(formatPnl(-1)).toContain('−')
    expect(formatPnl(-1)).not.toContain('-')
  })
})

describe('formatMoney', () => {
  it('rounds to whole dollars', () => {
    expect(formatMoney(10120.4)).toBe('$10,120')
    expect(formatMoney(-500.6)).toBe('−$501')
  })

  it('shows nothing read as a dash', () => {
    expect(formatMoney(null)).toBe('—')
  })
})

describe('formatLots', () => {
  it('keeps two places so the column lines up', () => {
    expect(formatLots(0.25)).toBe('0.25')
    expect(formatLots(1)).toBe('1.00')
  })
})

describe('formatDuration', () => {
  const now = Date.parse('2026-09-19T12:00:00Z')

  it('coarsens as the position ages', () => {
    expect(formatDuration('2026-09-19T11:59:18Z', now)).toBe('42s')
    expect(formatDuration('2026-09-19T11:30:00Z', now)).toBe('30m')
    expect(formatDuration('2026-09-19T08:45:00Z', now)).toBe('3h 15m')
    expect(formatDuration('2026-09-17T06:00:00Z', now)).toBe('2d 6h')
  })

  it('never runs backwards when the broker clock is ahead', () => {
    expect(formatDuration('2026-09-19T12:00:05Z', now)).toBe('0s')
  })

  it('shows an unknown open time as a dash', () => {
    expect(formatDuration(null, now)).toBe('—')
  })
})
