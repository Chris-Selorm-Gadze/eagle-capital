import { describe, it, expect } from 'vitest'
import { mapTradeRow, parseTradeCsv } from './csvImport'

describe('csvImport', () => {
  it('maps a "trading-data" row with dot-separated dates (Lots preferred over Volume)', () => {
    const row = {
      'Ticket ID': 'W6577997386192394', 'Open Time': '2025.12.18 15:10:44', 'Open Price': '48171.5',
      'Close Time': '2025.12.18 15:27:05', 'Close Price': '48216.51', 'Profit': '-9', 'Lots': '0.02',
      'Commission': '0', 'Swap': '0', 'Symbol': 'US30', 'Type': 'sell', 'SL': '48292.53', 'TP': '47455.59',
      'Pips': '-4501.000000', 'Volume': '2',
    }
    const t = mapTradeRow(row)
    expect(t).toMatchObject({
      symbol: 'US30', side: 'short', qty: 0.02, entryPrice: 48171.5, exitPrice: 48216.51, fees: 0, pnl: -9,
    })
    expect(t!.entryTime).toBe(new Date(2025, 11, 18, 15, 10, 44).toISOString())
    expect(t!.exitTime).toBe(new Date(2025, 11, 18, 15, 27, 5).toISOString())
  })

  it('maps a "trading-data" row with dash-separated dates', () => {
    const row = {
      'Ticket ID': 'W3270708777290308', 'Open Time': '2026-07-03 01:18:14', 'Open Price': '29348.19',
      'Close Time': '2026-07-03 01:18:23', 'Close Price': '29343.36', 'Profit': '-0.48', 'Lots': '0.01',
      'Commission': '0', 'Swap': '0', 'Symbol': 'NDX100', 'Type': 'buy', 'SL': '0', 'TP': '0',
      'Pips': '-483.000000', 'Volume': '1',
    }
    const t = mapTradeRow(row)
    expect(t).toMatchObject({ symbol: 'NDX100', side: 'long', qty: 0.01, pnl: -0.48 })
  })

  it('maps a "CLOSED_POSITIONS" row with slash dates and no Lots column (falls back to Volume)', () => {
    const row = {
      'ID': 'W327070877773699', 'Symbol': 'NDX100', 'Open Time': '18/06/2026 13:41:42', 'Volume': '0.16',
      'Side': 'SELL', 'Close Time': '18/06/2026 14:24:16', 'Open Price': '30160.25', 'Close Price': '30326.33',
      'Stop Loss': '30418.72', 'Take Profit': '29528.30', 'Swap': '0.00', 'Commission': '0.00',
      'Profit': '-265.73', 'Reason': 'User',
    }
    const t = mapTradeRow(row)
    expect(t).toMatchObject({ symbol: 'NDX100', side: 'short', qty: 0.16, pnl: -265.73 })
    expect(t!.entryTime).toBe(new Date(2026, 5, 18, 13, 41, 42).toISOString())
  })

  it('nets commission/swap out of Profit into pnl, and stores their negation as fees', () => {
    const row = {
      'Ticket ID': 'W657799738633787', 'Open Time': '2025.12.10 17:52:34', 'Open Price': '1.16582',
      'Close Time': '2025.12.10 19:00:29', 'Close Price': '1.16668', 'Profit': '-118.68', 'Lots': '1.38',
      'Commission': '-6.9', 'Swap': '0', 'Symbol': 'EURUSD', 'Type': 'sell', 'SL': '1166.66', 'TP': '1163.51',
      'Pips': '-86.000000', 'Volume': '138',
    }
    const t = mapTradeRow(row)
    expect(t!.pnl).toBeCloseTo(-125.58, 5)
    expect(t!.fees).toBeCloseTo(6.9, 5)
  })

  it('returns null for rows missing required fields', () => {
    expect(mapTradeRow({ Symbol: 'US30' })).toBeNull()
  })

  it('skips still-open positions ("Currently Running" close time) instead of throwing', () => {
    const row = {
      'Ticket ID': 'W3395295426105628', 'Open Time': '2025.12.02 07:53:40', 'Open Price': '4210.97',
      'Close Time': 'Currently Running', 'Close Price': '0', 'Profit': '-2.7', 'Lots': '0.06',
      'Commission': '-0.3', 'Swap': '0', 'Symbol': 'XAUUSD', 'Type': 'buy', 'SL': '0', 'TP': '0',
      'Pips': '0.000000', 'Volume': '6',
    }
    expect(mapTradeRow(row)).toBeNull()
  })

  it('parseTradeCsv parses a full CSV and counts unparseable rows as skipped', () => {
    const csv = [
      'Ticket ID,Open Time,Open Price,Close Time,Close Price,Profit,Lots,Commission,Swap,Symbol,Type,SL,TP,Pips,Volume',
      'W1,2025.12.18 15:10:44,48171.5,2025.12.18 15:27:05,48216.51,-9,0.02,0,0,US30,sell,48292.53,47455.59,-4501.000000,2',
      'W2,2026-07-03 01:18:14,29348.19,2026-07-03 01:18:23,29343.36,-0.48,0.01,0,0,NDX100,buy,0,0,-483.000000,1',
    ].join('\n')
    const { trades, skippedRows } = parseTradeCsv(csv)
    expect(trades).toHaveLength(2)
    expect(skippedRows).toBe(0)
  })
})
