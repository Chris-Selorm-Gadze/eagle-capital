import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { moneyFormat, type MoneyFormat } from '@/utils/money'

/* Which currency the money on screen is in.
 *
 * Provided by the page that decided it (the dashboard picks one currency at a
 * time — see utils/money.ts) and read by every tile and chart that prints a
 * figure, so none of them hard-codes a "$" again. Outside a provider it is USD,
 * which is what every page printed before this existed. */
const MoneyContext = createContext<MoneyFormat>(moneyFormat())

export function MoneyProvider({ currency, children }: { currency: string; children: ReactNode }) {
  const value = useMemo(() => moneyFormat(currency), [currency])
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

export function useMoney(): MoneyFormat {
  return useContext(MoneyContext)
}
