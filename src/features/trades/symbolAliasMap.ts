// Broker/prop-firm symbol naming varies wildly (US100 vs NAS100 vs NDX100 vs USTEC, XAUUSD for
// gold, etc.) and FMP's free tier only recognizes a specific set of tickers (forex/crypto majors
// as-is, indices only via Yahoo-style carets like ^DJI/^GSPC). Rather than hardcoding a guessed
// mapping for every firm's convention — which CLAUDE.md already rules out for rule logic, and
// would just as easily be wrong here — the user maps their own broker symbol to an FMP ticker
// once from the Trade Chart tab, and it's remembered for every future trade with that symbol.
// UI-only preference, not trade data, so localStorage is fine (same reasoning as the sidebar's
// collapsed-state preference).

const STORAGE_KEY = 'eaglecapital:fmp-symbol-map'

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getFmpSymbol(rawSymbol: string): string {
  return readMap()[rawSymbol] ?? rawSymbol
}

export function setFmpSymbolAlias(rawSymbol: string, fmpTicker: string): void {
  const map = readMap()
  map[rawSymbol] = fmpTicker
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}
