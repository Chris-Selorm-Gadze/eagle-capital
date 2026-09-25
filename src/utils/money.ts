/* Money is always in SOME currency, and two currencies never add.
 *
 * The dashboard summed every trade's P&L into one figure with a "$" in front,
 * whatever the account's currency — so a USD account and a USC (cent) account
 * produced a headline number that was neither, and the balance chart added a
 * 10,000 USD account to a 1,000,000 USC one. There is no exchange-rate source
 * in this app, and inventing one would put a made-up number on the screen, so
 * the rule is structural instead: every money figure is computed within ONE
 * currency, and the currency travels with the formatter that prints it.
 */

import type { Account } from '../types'

const DEFAULT_CURRENCY = 'USD'

/** An account's currency as a canonical code. Broker labels come in any case. */
export function currencyOf(account: Pick<Account, 'currency'> | undefined): string {
  const code = (account?.currency ?? '').trim().toUpperCase()
  return code || DEFAULT_CURRENCY
}

export interface CurrencyGroup {
  currency: string
  accountIds: Set<string>
  tradeCount: number
}

/** The currencies a set of accounts spans, most-traded first. */
export function currencyGroups(
  accounts: Pick<Account, 'id' | 'currency'>[],
  trades: { accountId: string }[],
): CurrencyGroup[] {
  const groups = new Map<string, CurrencyGroup>()
  const byAccount = new Map<string, CurrencyGroup>()
  for (const a of accounts) {
    if (!a.id) continue
    const code = currencyOf(a)
    let g = groups.get(code)
    if (!g) {
      g = { currency: code, accountIds: new Set(), tradeCount: 0 }
      groups.set(code, g)
    }
    g.accountIds.add(a.id)
    byAccount.set(a.id, g)
  }
  for (const t of trades) {
    const g = byAccount.get(t.accountId)
    if (g) g.tradeCount += 1
  }
  return [...groups.values()].sort(
    (a, b) => b.tradeCount - a.tradeCount || a.currency.localeCompare(b.currency),
  )
}

export interface MoneyFormat {
  currency: string
  /** Whole units with the currency's symbol: "$1,250", "-€40", "USC 5,000". */
  whole: (value: number) => string
  /** Always signed: "+$1,250", "-$40". */
  signed: (value: number) => string
  /** Signed, to the cent — for one trade's result, where rounding hides it. */
  signedExact: (value: number) => string
}

function numberFormat(currency: string, digits: number): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    })
  } catch {
    // A code Intl will not take at all (not three letters, e.g. "USDT").
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    })
  }
}

export function moneyFormat(currency: string = DEFAULT_CURRENCY): MoneyFormat {
  const code = currency.trim().toUpperCase() || DEFAULT_CURRENCY
  const printer = (digits: number) => {
    const nf = numberFormat(code, digits)
    const hasSymbol = nf.resolvedOptions().style === 'currency'
    // -0 prints as "-$0"; a rounded-away loss is not a loss.
    return (value: number) => {
      const text = nf.format(Object.is(value, -0) ? 0 : value)
      return hasSymbol ? text : `${text} ${code}`
    }
  }
  const whole = printer(0)
  const exact = printer(2)
  return {
    currency: code,
    whole,
    signed: (value: number) => (value > 0 ? `+${whole(value)}` : whole(value)),
    signedExact: (value: number) => (value > 0 ? `+${exact(value)}` : exact(value)),
  }
}
