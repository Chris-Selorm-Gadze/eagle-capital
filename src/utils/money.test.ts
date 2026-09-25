import { describe, expect, it } from 'vitest'
import { currencyGroups, currencyOf, moneyFormat } from './money'

describe('currencyOf', () => {
  it('canonicalises and defaults to USD', () => {
    expect(currencyOf({ currency: ' usd ' })).toBe('USD')
    expect(currencyOf({ currency: undefined })).toBe('USD')
  })
})

describe('currencyGroups', () => {
  it('splits accounts by currency, most-traded first', () => {
    const accounts = [
      { id: 'a', currency: 'USD' }, { id: 'b', currency: 'USC' }, { id: 'c', currency: 'usd' },
    ]
    const trades = [{ accountId: 'b' }, { accountId: 'b' }, { accountId: 'a' }]
    const groups = currencyGroups(accounts, trades)
    expect(groups.map((g) => g.currency)).toEqual(['USC', 'USD'])
    expect([...groups[1].accountIds].sort()).toEqual(['a', 'c'])
  })
})

describe('moneyFormat', () => {
  it('prints whole units with the currency symbol', () => {
    expect(moneyFormat('USD').whole(1250.4)).toBe('$1,250')
    expect(moneyFormat('USD').whole(-40)).toBe('-$40')
    expect(moneyFormat('EUR').whole(10)).toBe('€10')
  })

  it('signs gains explicitly', () => {
    expect(moneyFormat('USD').signed(5)).toBe('+$5')
    expect(moneyFormat('USD').signed(-5)).toBe('-$5')
  })

  it('never prints negative zero', () => {
    expect(moneyFormat('USD').whole(-0)).toBe('$0')
  })

  it('names a currency Intl has no symbol for rather than pretending it is dollars', () => {
    expect(moneyFormat('USC').whole(5000)).toContain('USC')
    expect(moneyFormat('USDT').whole(5)).toBe('5 USDT')
  })
})

describe('signedExact', () => {
  it('keeps the cents a single trade result needs', () => {
    expect(moneyFormat('USD').signedExact(12.345)).toBe('+$12.35')
    expect(moneyFormat('EUR').signedExact(-3.1)).toBe('-€3.10')
  })
})
