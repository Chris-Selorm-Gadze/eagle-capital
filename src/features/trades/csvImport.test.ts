import { describe, it, expect } from 'vitest'
import {
  mapTradeRow, parseTradeCsv, parseSide, parseNumber, parseCsvDateTime, detectDateOrder,
} from './csvImport'

/** Narrows the mapTradeRow result to the success branch, failing loudly otherwise. */
function ok(result: ReturnType<typeof mapTradeRow>) {
  if (!('trade' in result)) throw new Error(`expected a trade, got rejection: ${result.reason}`)
  return result.trade
}

describe('parseSide', () => {
  it('maps buy/sell in any case', () => {
    expect(parseSide('Buy')).toBe('long')
    expect(parseSide('SELL')).toBe('short')
  })

  // The old parser was `startsWith('b')`, so "Long" fell through to 'short' and
  // every trade in such an export was imported backwards.
  it('maps long/short — the aliases that used to invert', () => {
    expect(parseSide('Long')).toBe('long')
    expect(parseSide('Short')).toBe('short')
    expect(parseSide('LONG')).toBe('long')
  })

  it('maps MT4 numeric order types and pending-order variants', () => {
    expect(parseSide('0')).toBe('long')
    expect(parseSide('1')).toBe('short')
    expect(parseSide('Buy Limit')).toBe('long')
    expect(parseSide('sell_stop')).toBe('short')
  })

  it('returns null rather than guessing on an unknown value', () => {
    expect(parseSide('balance')).toBeNull()
    expect(parseSide('')).toBeNull()
    expect(parseSide('deposit')).toBeNull()
  })
})

describe('parseNumber', () => {
  it('reads plain and signed decimals', () => {
    expect(parseNumber('48171.5')).toBe(48171.5)
    expect(parseNumber('-265.73')).toBe(-265.73)
    expect(parseNumber('+12')).toBe(12)
  })

  // A thousands separator used to produce NaN, which Postgres accepts into a
  // numeric column and which then turns every aggregate on the dashboard to NaN.
  it('reads US thousands separators', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('1,234,567')).toBe(1234567)
  })

  it('reads European separators', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56)
    expect(parseNumber('12,5')).toBe(12.5)
  })

  it('reads currency symbols and parenthesised negatives', () => {
    expect(parseNumber('$1,500.25')).toBe(1500.25)
    expect(parseNumber('(250.00)')).toBe(-250)
  })

  it('returns null for anything unreadable', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('N/A')).toBeNull()
    expect(parseNumber('Currently Running')).toBeNull()
  })
})

describe('detectDateOrder', () => {
  it('proves day-first from a day above 12', () => {
    expect(detectDateOrder(['18/06/2026 13:41:42'])).toMatchObject({ proven: 'dmy', ambiguous: false })
  })

  it('proves month-first from a second component above 12', () => {
    expect(detectDateOrder(['07/25/2026 14:30:00'])).toMatchObject({ proven: 'mdy', ambiguous: false })
  })

  it('reports ambiguity when every value could be either', () => {
    expect(detectDateOrder(['03/04/2026 09:00:00'])).toMatchObject({ proven: null, ambiguous: true })
  })

  it('flags a conflict when the file proves both orders', () => {
    expect(detectDateOrder(['18/06/2026 13:41:42', '07/25/2026 14:30:00'])).toMatchObject({ conflict: true })
  })

  it('is neither ambiguous nor proven when there are no slash dates', () => {
    expect(detectDateOrder(['2026-07-03 01:18:14'])).toMatchObject({ proven: null, ambiguous: false })
  })
})

describe('parseCsvDateTime', () => {
  it('reads dot, dash and slash separators', () => {
    expect(parseCsvDateTime('2025.12.18 15:10:44', 'dmy', 0)).toBe('2025-12-18T15:10:44.000Z')
    expect(parseCsvDateTime('2026-07-03 01:18:14', 'dmy', 0)).toBe('2026-07-03T01:18:14.000Z')
    expect(parseCsvDateTime('18/06/2026 13:41:42', 'dmy', 0)).toBe('2026-06-18T13:41:42.000Z')
  })

  it('honours the month-first order for US exports', () => {
    expect(parseCsvDateTime('07/25/2026 14:30:00', 'mdy', 0)).toBe('2026-07-25T14:30:00.000Z')
  })

  // Previously this reached `new Date(2026, 24, 7)`, which rolls over to 2028.
  it('rejects an out-of-range month instead of rolling it into a future year', () => {
    expect(parseCsvDateTime('07/25/2026 14:30:00', 'dmy', 0)).toBeNull()
  })

  it('converts from the broker server offset to UTC', () => {
    // A GMT+3 broker stamping 09:00 means 06:00 UTC.
    expect(parseCsvDateTime('2026-07-03 09:00:00', 'dmy', 180)).toBe('2026-07-03T06:00:00.000Z')
    expect(parseCsvDateTime('2026-07-03 09:00:00', 'dmy', -300)).toBe('2026-07-03T14:00:00.000Z')
  })

  it('rejects unreadable values', () => {
    expect(parseCsvDateTime('Currently Running', 'dmy', 0)).toBeNull()
    expect(parseCsvDateTime('2026-02-30 10:00:00', 'dmy', 0)).toBeNull()
  })
})

describe('mapTradeRow', () => {
  const base = {
    'Ticket ID': 'W6577997386192394', 'Open Time': '2025.12.18 15:10:44', 'Open Price': '48171.5',
    'Close Time': '2025.12.18 15:27:05', 'Close Price': '48216.51', 'Profit': '-9', 'Lots': '0.02',
    'Commission': '0', 'Swap': '0', 'Symbol': 'US30', 'Type': 'sell', 'Volume': '2',
  }

  it('maps a "trading-data" row, preferring Lots over Volume', () => {
    const t = ok(mapTradeRow(base, 'dmy', 0))
    expect(t).toMatchObject({ symbol: 'US30', side: 'short', qty: 0.02, entryPrice: 48171.5, exitPrice: 48216.51, fees: 0, pnl: -9 })
    expect(t.entryTime).toBe('2025-12-18T15:10:44.000Z')
  })

  it('nets commission/swap out of Profit into pnl, storing their negation as fees', () => {
    const t = ok(mapTradeRow({ ...base, Profit: '-118.68', Commission: '-6.9', Swap: '0' }, 'dmy', 0))
    expect(t.pnl).toBeCloseTo(-125.58, 5)
    expect(t.fees).toBeCloseTo(6.9, 5)
  })

  it('rejects a row with a reason rather than silently dropping it', () => {
    const result = mapTradeRow({ Symbol: 'US30' }, 'dmy', 0)
    expect(result).toHaveProperty('reason')
    expect('reason' in result && result.reason).toMatch(/missing/)
  })

  it('rejects a still-open position with an explanatory reason', () => {
    const result = mapTradeRow({ ...base, 'Close Time': 'Currently Running' }, 'dmy', 0)
    expect('reason' in result && result.reason).toMatch(/close time/i)
  })

  it('rejects a row whose close precedes its open', () => {
    const result = mapTradeRow({ ...base, 'Close Time': '2025.12.18 15:00:00' }, 'dmy', 0)
    expect('reason' in result && result.reason).toMatch(/before open/)
  })

  it('rejects a non-positive volume', () => {
    expect('reason' in mapTradeRow({ ...base, Lots: '0', Volume: '0' }, 'dmy', 0)).toBe(true)
  })
})

describe('parseTradeCsv', () => {
  const header = 'Ticket ID,Open Time,Open Price,Close Time,Close Price,Profit,Lots,Commission,Swap,Symbol,Type'

  it('parses a full CSV and reports rejections with row numbers', () => {
    const csv = [
      header,
      'W1,2025.12.18 15:10:44,48171.5,2025.12.18 15:27:05,48216.51,-9,0.02,0,0,US30,sell',
      'W2,2026-07-03 01:18:14,29348.19,2026-07-03 01:18:23,29343.36,-0.48,0.01,0,0,NDX100,buy',
      'W3,2026-07-03 01:18:14,1,Currently Running,0,-2.7,0.06,0,0,XAUUSD,buy',
    ].join('\n')
    const result = parseTradeCsv(csv, { brokerUtcOffsetMinutes: 0 })
    expect(result.trades).toHaveLength(2)
    expect(result.rejected).toEqual([{ row: 3, reason: expect.stringMatching(/close time/i) }])
  })

  it('detects a US export from the file and parses it month-first', () => {
    const csv = [
      header,
      'W1,07/25/2026 14:30:00,100,07/25/2026 15:00:00,110,10,1,0,0,MES,Buy',
    ].join('\n')
    const result = parseTradeCsv(csv, { brokerUtcOffsetMinutes: 0 })
    expect(result.provenDateOrder).toBe('mdy')
    expect(result.trades[0].entryTime).toBe('2026-07-25T14:30:00.000Z')
  })

  it('flags an ambiguous file so the caller can ask before importing', () => {
    const csv = [
      header,
      'W1,03/04/2026 14:30:00,100,03/04/2026 15:00:00,110,10,1,0,0,MES,Buy',
    ].join('\n')
    const result = parseTradeCsv(csv, { brokerUtcOffsetMinutes: 0 })
    expect(result.dateOrderAmbiguous).toBe(true)
    expect(result.provenDateOrder).toBeNull()
  })

  it('honours an explicit override over the file', () => {
    const csv = [
      header,
      'W1,03/04/2026 14:30:00,100,03/04/2026 15:00:00,110,10,1,0,0,MES,Buy',
    ].join('\n')
    const result = parseTradeCsv(csv, { dateOrder: 'mdy', brokerUtcOffsetMinutes: 0 })
    expect(result.dateOrderAmbiguous).toBe(false)
    expect(result.trades[0].entryTime).toBe('2026-03-04T14:30:00.000Z')
  })

  it('refuses to import a file that proves both date orders', () => {
    const csv = [
      header,
      'W1,18/06/2026 13:00:00,100,18/06/2026 14:00:00,110,10,1,0,0,MES,Buy',
      'W2,07/25/2026 14:30:00,100,07/25/2026 15:00:00,110,10,1,0,0,MES,Buy',
    ].join('\n')
    const result = parseTradeCsv(csv, { brokerUtcOffsetMinutes: 0 })
    expect(result.dateOrderConflict).toBe(true)
    expect(result.trades).toHaveLength(0)
  })

  it('imports Long/Short exports the right way round', () => {
    const csv = [
      header,
      'W1,2026-07-03 01:18:14,100,2026-07-03 02:00:00,110,10,1,0,0,MES,Long',
      'W2,2026-07-03 03:18:14,100,2026-07-03 04:00:00,90,10,1,0,0,MES,Short',
    ].join('\n')
    const result = parseTradeCsv(csv, { brokerUtcOffsetMinutes: 0 })
    expect(result.trades.map((t) => t.side)).toEqual(['long', 'short'])
  })
})
