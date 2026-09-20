import type { LiveAccountPositions } from '../../db/livePositions'

/* Totals, grouped by the currency they are actually denominated in.
 *
 * MT5 reports a position's profit in its account's currency, so adding a EUR
 * account's P&L to a USD account's produces a number in no currency at all.
 * The page summed them flat, which is silently wrong the moment someone holds
 * accounts at two brokers in different denominations — and it is the headline
 * figure, so being wrong there is worse than being wrong anywhere else.
 *
 * Grouping rather than converting is deliberate: a conversion needs a rate, a
 * rate needs a source and a timestamp, and an FX rate quietly going stale
 * behind a P&L figure is a worse failure than showing two honest subtotals.
 */
export interface CurrencyTotal {
  currency: string
  unrealized: number
  equity: number
  accounts: number
}

export interface LiveTotals {
  /** One entry per currency held, largest exposure first. */
  byCurrency: CurrencyTotal[]
  open: number
  accounts: number
  /** The single currency everything is in, or null when there is more than one. */
  singleCurrency: string | null
}

const UNKNOWN = '—'

export function liveTotals(accounts: LiveAccountPositions[]): LiveTotals {
  const groups = new Map<string, CurrencyTotal>()
  let open = 0

  for (const account of accounts) {
    const currency = account.currency || UNKNOWN
    const group = groups.get(currency) ?? {
      currency,
      unrealized: 0,
      equity: 0,
      accounts: 0,
    }
    group.accounts += 1
    group.equity += account.equity ?? 0
    for (const position of account.positions) {
      group.unrealized += position.unrealizedPnl
      open += 1
    }
    groups.set(currency, group)
  }

  const byCurrency = [...groups.values()].sort(
    (a, b) => Math.abs(b.equity) - Math.abs(a.equity) || a.currency.localeCompare(b.currency),
  )

  return {
    byCurrency,
    open,
    accounts: accounts.length,
    singleCurrency: byCurrency.length === 1 ? byCurrency[0].currency : null,
  }
}

/** One account's open P&L — the number a trader looks for first on a row. */
export function accountUnrealized(account: LiveAccountPositions): number {
  return account.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
}
