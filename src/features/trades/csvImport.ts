import Papa from 'papaparse'

/* Generic MT4/5-style broker trade-history CSV reader.
 *
 * Three things here used to corrupt imports silently, which for a trading
 * journal is worse than refusing the file:
 *
 *   1. Direction was `raw.startsWith('b') ? 'long' : 'short'`, so an export
 *      using Long/Short instead of Buy/Sell imported EVERY trade as short. The
 *      P&L came from the broker's own column so nothing looked wrong — only the
 *      direction, the long/short split and every pattern built on it.
 *   2. Slash dates were assumed DD/MM/YYYY. A US export of "07/25/2026" parsed
 *      as month 25, which JavaScript rolls over into January 2028.
 *   3. Timestamps were parsed in the *importer's* local zone. MT4/MT5 stamps
 *      are in the broker's server zone (commonly GMT+2/+3), so every fill
 *      landed hours off, which moves trades across day boundaries.
 *
 * Ambiguity is now either resolved from evidence in the file or handed back to
 * the caller to ask about — never guessed.
 */

export interface ParsedTrade {
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

/** Which component of a `nn/nn/yyyy` date comes first. */
export type DateOrder = 'dmy' | 'mdy'

export interface CsvParseOptions {
  /** Forces an interpretation of slash dates. Omit to use what the file proves. */
  dateOrder?: DateOrder
  /** The broker's UTC offset in minutes (GMT+3 → 180). Omit to read timestamps
   * as the importing browser's local time, which is what the old parser did. */
  brokerUtcOffsetMinutes?: number
}

export interface RejectedRow {
  /** 1-based row number within the data rows, matching what a spreadsheet shows. */
  row: number
  reason: string
}

export interface CsvParseResult {
  trades: ParsedTrade[]
  rejected: RejectedRow[]
  /** What the file itself proves about slash dates. `null` when it contains no
   * slash dates at all. */
  provenDateOrder: DateOrder | null
  /** True when the file has slash dates but none of them disambiguate (every
   * day and month value is ≤ 12). The caller must ask. */
  dateOrderAmbiguous: boolean
  /** Set when the file contains dates that prove BOTH orders — it can't all be
   * one format, so the file is malformed rather than merely ambiguous. */
  dateOrderConflict: boolean
}

const SIDE_ALIASES: Record<string, 'long' | 'short'> = {
  buy: 'long', b: 'long', long: 'long', bull: 'long', bought: 'long',
  'buy limit': 'long', 'buy stop': 'long', 'buy_limit': 'long', 'buy_stop': 'long',
  sell: 'short', s: 'short', short: 'short', bear: 'short', sold: 'short',
  'sell limit': 'short', 'sell stop': 'short', 'sell_limit': 'short', 'sell_stop': 'short',
  // MT4 exports the order type as an integer in some report variants.
  '0': 'long', '1': 'short',
}

/** Maps a broker's direction string. Returns null rather than guessing — an
 * unrecognised value used to fall through to 'short'. */
export function parseSide(raw: string): 'long' | 'short' | null {
  const key = raw.trim().toLowerCase()
  if (key in SIDE_ALIASES) return SIDE_ALIASES[key]
  // "Buy 0.10 EURUSD" style composites: fall back to the leading word.
  const firstWord = key.split(/[\s_]/)[0]
  return firstWord in SIDE_ALIASES ? SIDE_ALIASES[firstWord] : null
}

/** Parses a broker's numeric cell. Handles thousands separators in both the
 * US ("1,234.56") and European ("1.234,56") conventions, currency symbols, and
 * parenthesised negatives. Returns null for anything it can't read, so a NaN
 * can never reach a NOT NULL numeric column and turn the dashboard into $NaN. */
export function parseNumber(raw: string): number | null {
  let s = raw.trim()
  if (s === '') return null

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  // Strip currency symbols, spaces and non-breaking spaces used as separators.
  s = s.replace(/[^\d.,+-]/g, '')
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever appears last is the decimal separator; the other groups thousands.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // A lone comma is a thousands separator only if it groups exactly three
    // digits at the end ("1,234"); otherwise it's a decimal comma ("12,5").
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

const DOT_OR_DASH = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
const SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/

/** Scans every timestamp in the file for one that can only be read one way —
 * a first component above 12 means day-first, a second component above 12 means
 * month-first. */
export function detectDateOrder(samples: string[]): {
  proven: DateOrder | null
  ambiguous: boolean
  conflict: boolean
} {
  let sawDmy = false
  let sawMdy = false
  let sawSlash = false
  for (const raw of samples) {
    const m = raw.trim().match(SLASH)
    if (!m) continue
    sawSlash = true
    const first = Number(m[1])
    const second = Number(m[2])
    if (first > 12) sawDmy = true
    if (second > 12) sawMdy = true
  }
  if (sawDmy && sawMdy) return { proven: null, ambiguous: false, conflict: true }
  if (sawDmy) return { proven: 'dmy', ambiguous: false, conflict: false }
  if (sawMdy) return { proven: 'mdy', ambiguous: false, conflict: false }
  return { proven: null, ambiguous: sawSlash, conflict: false }
}

/** Converts a broker's wall-clock timestamp to an ISO instant.
 *
 * `offsetMinutes` is the broker's UTC offset; when omitted the string is read
 * as the importing browser's local time (the historical behaviour). */
export function parseCsvDateTime(
  raw: string,
  dateOrder: DateOrder,
  offsetMinutes?: number,
): string | null {
  const trimmed = raw.trim()
  let y: number, mo: number, d: number, h: number, mi: number, s: number

  const iso = trimmed.match(DOT_OR_DASH)
  const slash = trimmed.match(SLASH)
  if (iso) {
    y = Number(iso[1]); mo = Number(iso[2]); d = Number(iso[3])
    h = Number(iso[4]); mi = Number(iso[5]); s = Number(iso[6] ?? 0)
  } else if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    y = Number(slash[3])
    if (dateOrder === 'dmy') { d = a; mo = b } else { mo = a; d = b }
    h = Number(slash[4]); mi = Number(slash[5]); s = Number(slash[6] ?? 0)
  } else {
    return null
  }

  // Reject out-of-range components outright. The old parser fed them to the
  // Date constructor, which silently rolls month 25 over into the next year.
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null

  const utcMs = Date.UTC(y, mo - 1, d, h, mi, s)
  if (offsetMinutes === undefined) {
    // Local interpretation: build from local components instead.
    const local = new Date(y, mo - 1, d, h, mi, s)
    if (Number.isNaN(local.getTime())) return null
    // Guard against a rollover the range check above couldn't catch (Feb 30).
    if (local.getMonth() !== mo - 1 || local.getDate() !== d) return null
    return local.toISOString()
  }
  const date = new Date(utcMs - offsetMinutes * 60_000)
  if (Number.isNaN(date.getTime())) return null
  if (new Date(utcMs).getUTCMonth() !== mo - 1 || new Date(utcMs).getUTCDate() !== d) return null
  return date.toISOString()
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k]
  }
  return undefined
}

const COLUMNS = {
  symbol: ['Symbol', 'Instrument', 'Ticker', 'Market'],
  openTime: ['Open Time', 'Entry Time', 'Open Date', 'Opened'],
  closeTime: ['Close Time', 'Exit Time', 'Close Date', 'Closed'],
  openPrice: ['Open Price', 'Entry Price', 'Price', 'Open'],
  closePrice: ['Close Price', 'Exit Price', 'Close'],
  side: ['Type', 'Side', 'Direction', 'Action', 'B/S'],
  qty: ['Lots', 'Volume', 'Quantity', 'Size', 'Qty'],
  profit: ['Profit', 'P&L', 'Net P/L', 'PnL', 'Realized P/L'],
  commission: ['Commission', 'Commissions', 'Fee', 'Fees'],
  swap: ['Swap', 'Rollover', 'Storage'],
  id: ['Ticket ID', 'Ticket', 'ID', 'Order ID', 'Deal ID', 'Position ID'],
}

export function mapTradeRow(
  row: Record<string, string>,
  dateOrder: DateOrder,
  offsetMinutes?: number,
): { trade: ParsedTrade } | { reason: string } {
  const symbol = pick(row, COLUMNS.symbol)
  const openTime = pick(row, COLUMNS.openTime)
  const closeTime = pick(row, COLUMNS.closeTime)
  const openPriceRaw = pick(row, COLUMNS.openPrice)
  const closePriceRaw = pick(row, COLUMNS.closePrice)
  const sideRaw = pick(row, COLUMNS.side)
  const qtyRaw = pick(row, COLUMNS.qty)
  const profitRaw = pick(row, COLUMNS.profit)

  const missing = [
    !symbol && 'symbol', !openTime && 'open time', !closeTime && 'close time',
    !openPriceRaw && 'open price', !closePriceRaw && 'close price',
    !sideRaw && 'type/side', !qtyRaw && 'volume', !profitRaw && 'profit',
  ].filter(Boolean)
  if (missing.length > 0) return { reason: `missing ${missing.join(', ')}` }

  const side = parseSide(sideRaw!)
  if (!side) return { reason: `unrecognised direction "${sideRaw}"` }

  // Still-open positions come through with Close Time "Currently Running".
  const entryTime = parseCsvDateTime(openTime!, dateOrder, offsetMinutes)
  if (!entryTime) return { reason: `unreadable open time "${openTime}"` }
  const exitTime = parseCsvDateTime(closeTime!, dateOrder, offsetMinutes)
  if (!exitTime) return { reason: `unreadable close time "${closeTime}" (still open?)` }
  if (new Date(exitTime) < new Date(entryTime)) return { reason: 'close time is before open time' }

  const entryPrice = parseNumber(openPriceRaw!)
  const exitPrice = parseNumber(closePriceRaw!)
  const qty = parseNumber(qtyRaw!)
  const profit = parseNumber(profitRaw!)
  if (entryPrice === null) return { reason: `unreadable open price "${openPriceRaw}"` }
  if (exitPrice === null) return { reason: `unreadable close price "${closePriceRaw}"` }
  if (qty === null) return { reason: `unreadable volume "${qtyRaw}"` }
  if (profit === null) return { reason: `unreadable profit "${profitRaw}"` }
  if (qty <= 0) return { reason: `volume must be positive (got ${qty})` }

  const commission = parseNumber(pick(row, COLUMNS.commission) ?? '0') ?? 0
  const swap = parseNumber(pick(row, COLUMNS.swap) ?? '0') ?? 0
  const sourceId = pick(row, COLUMNS.id) ?? `${symbol}-${openTime}-${closeTime}`

  // Broker "Profit" columns are typically gross, before commission/swap — net it
  // out the same way computePnl() does for manual entries (gross − fees), so
  // charts sum consistently. Commission and swap arrive as negatives.
  return {
    trade: {
      symbol: symbol!,
      side,
      qty,
      entryPrice,
      exitPrice,
      entryTime,
      exitTime,
      fees: -(commission + swap) || 0, // avoid -0 when both are zero
      pnl: profit + commission + swap,
      sourceId,
    },
  }
}

export function parseTradeCsv(csvText: string, options: CsvParseOptions = {}): CsvParseResult {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const timestamps: string[] = []
  for (const row of data) {
    const open = pick(row, COLUMNS.openTime)
    const close = pick(row, COLUMNS.closeTime)
    if (open) timestamps.push(open)
    if (close) timestamps.push(close)
  }
  const detected = detectDateOrder(timestamps)

  // An explicit choice always wins; otherwise use what the file proves. When it
  // proves nothing we still have to parse with *something* — day-first, the
  // more common convention outside the US, and the caller is told it's a guess
  // via `dateOrderAmbiguous` so it can ask before committing the import.
  const dateOrder: DateOrder = options.dateOrder ?? detected.proven ?? 'dmy'

  const trades: ParsedTrade[] = []
  const rejected: RejectedRow[] = []

  if (!detected.conflict) {
    data.forEach((row, i) => {
      const result = mapTradeRow(row, dateOrder, options.brokerUtcOffsetMinutes)
      if ('trade' in result) trades.push(result.trade)
      else rejected.push({ row: i + 1, reason: result.reason })
    })
  }

  return {
    trades,
    rejected,
    provenDateOrder: detected.proven,
    dateOrderAmbiguous: detected.ambiguous && options.dateOrder === undefined,
    dateOrderConflict: detected.conflict,
  }
}
