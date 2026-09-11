import { describe, it, expect } from 'vitest'
import { tradesToCsv } from './userData'

describe('tradesToCsv', () => {
  it('returns empty string for no trades', () => {
    expect(tradesToCsv([])).toBe('')
  })

  it('writes a header row from the union of keys', () => {
    const csv = tradesToCsv([{ symbol: 'NQ', pnl: 100 }, { symbol: 'ES', fees: 4 }])
    expect(csv.split('\n')[0]).toBe('symbol,pnl,fees')
  })

  it('quotes values containing a comma, quote or newline', () => {
    const csv = tradesToCsv([{ notes: 'sized up, chased' }])
    expect(csv.split('\n')[1]).toBe('"sized up, chased"')
  })

  it('doubles inner quotes so the field survives a round trip', () => {
    const csv = tradesToCsv([{ notes: 'called it a "setup"' }])
    expect(csv.split('\n')[1]).toBe('"called it a ""setup"""')
  })

  it('renders null and undefined as empty rather than the words', () => {
    const csv = tradesToCsv([{ a: null, b: undefined, c: 0 }])
    expect(csv.split('\n')[1]).toBe(',,0')
  })

  it('serialises nested values instead of printing [object Object]', () => {
    const csv = tradesToCsv([{ tags: ['a', 'b'] }])
    expect(csv.split('\n')[1]).toBe('"[""a"",""b""]"')
  })
})
