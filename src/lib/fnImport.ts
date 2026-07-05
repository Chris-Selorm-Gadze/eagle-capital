import Papa from 'papaparse'

// FundedNext's dashboard exports trades in two CSV shapes depending on report type
// ("trading-data" vs "CLOSED_POSITIONS"), with three different Open/Close Time formats
// seen across exports (YYYY.MM.DD, YYYY-MM-DD, DD/MM/YYYY). Column lookup + date-format
// sniffing below handles all of them.

export interface ParsedFnTrade {
  symbol: string
  side: 'long' | 'short'
  qty: number
  entryPrice: number
  exitPrice: number
  entryTime: string // ISO
  exitTime: string // ISO
  fees: number
  pnl: number
  sourceId: string
}

function parseFnDateTime(raw: string): string {
  const dotOrDash = raw.match(/^(\d{4})[.-](\d{2})[.-](\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)

  let y: number, mo: number, d: number, h: number, mi: number, s: number
  if (dotOrDash) {
    ;[y, mo, d, h, mi, s] = dotOrDash.slice(1).map(Number)
  } else if (slash) {
    const [, dd, mm, yyyy, hh, min, sec] = slash
    y = Number(yyyy); mo = Number(mm); d = Number(dd); h = Number(hh); mi = Number(min); s = Number(sec)
  } else {
    throw new Error(`Unrecognized FundedNext date format: "${raw}"`)
  }
  return new Date(y, mo - 1, d, h, mi, s).toISOString()
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k]
  }
  return undefined
}

export function mapFnRow(row: Record<string, string>): ParsedFnTrade | null {
  const symbol = pick(row, ['Symbol'])
  const openTime = pick(row, ['Open Time'])
  const closeTime = pick(row, ['Close Time'])
  const openPrice = pick(row, ['Open Price'])
  const closePrice = pick(row, ['Close Price'])
  const sideRaw = pick(row, ['Type', 'Side'])
  const qtyRaw = pick(row, ['Lots', 'Volume'])
  const profitRaw = pick(row, ['Profit'])
  const commission = Number(pick(row, ['Commission']) ?? '0')
  const swap = Number(pick(row, ['Swap']) ?? '0')
  const sourceId = pick(row, ['Ticket ID', 'ID']) ?? `${symbol}-${openTime}-${closeTime}`

  if (!symbol || !openTime || !closeTime || !openPrice || !closePrice || !sideRaw || !qtyRaw || !profitRaw) {
    return null
  }

  // Still-open positions show up with Close Time "Currently Running" (and Close Price 0) —
  // not a closed trade yet, so skip rather than failing the whole import.
  let entryTime: string, exitTime: string
  try {
    entryTime = parseFnDateTime(openTime)
    exitTime = parseFnDateTime(closeTime)
  } catch {
    return null
  }

  const profit = Number(profitRaw)
  // FundedNext's "Profit" is gross, before commission/swap — net it out the same way
  // computePnl() does for manual entries (gross - fees), so charts sum consistently.
  return {
    symbol,
    side: sideRaw.toLowerCase().startsWith('b') ? 'long' : 'short',
    qty: Number(qtyRaw),
    entryPrice: Number(openPrice),
    exitPrice: Number(closePrice),
    entryTime,
    exitTime,
    fees: -(commission + swap) || 0, // avoid -0 when both are zero
    pnl: profit + commission + swap,
    sourceId,
  }
}

export interface FnParseResult {
  trades: ParsedFnTrade[]
  skippedRows: number
}

export function parseFnCsv(csvText: string): FnParseResult {
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  const trades: ParsedFnTrade[] = []
  let skippedRows = 0
  for (const row of data) {
    const trade = mapFnRow(row)
    if (trade) trades.push(trade)
    else skippedRows++
  }
  return { trades, skippedRows }
}
