import { describe, expect, it } from 'vitest'
import { byMostRecentClose } from './tradeOrder'

const t = (id: string, entryTime: string, exitTime: string) => ({ id, entryTime, exitTime })

describe('byMostRecentClose', () => {
  it('puts the trade that closed last first, even within one day', () => {
    const trades = [
      t('a', '2026-09-23T09:00:00Z', '2026-09-23T09:30:00Z'),
      t('b', '2026-09-23T10:00:00Z', '2026-09-23T14:05:00Z'),
      t('c', '2026-09-23T11:00:00Z', '2026-09-23T11:10:00Z'),
    ]
    expect([...trades].sort(byMostRecentClose).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('orders a position held overnight by when it closed, not when it opened', () => {
    const trades = [
      t('today', '2026-09-23T09:00:00Z', '2026-09-23T09:05:00Z'),
      t('overnight', '2026-09-22T15:00:00Z', '2026-09-23T13:00:00Z'),
    ]
    expect([...trades].sort(byMostRecentClose)[0].id).toBe('overnight')
  })

  it('is a total order: identical times fall back to id', () => {
    const same = '2026-09-23T09:00:00Z'
    expect(byMostRecentClose(t('a', same, same), t('b', same, same))).toBeLessThan(0)
    expect(byMostRecentClose(t('a', same, same), t('a', same, same))).toBe(0)
  })

  it('sorts unreadable times last', () => {
    const trades = [t('bad', 'nope', 'nope'), t('good', '2026-09-23T09:00:00Z', '2026-09-23T09:05:00Z')]
    expect([...trades].sort(byMostRecentClose).map((x) => x.id)).toEqual(['good', 'bad'])
  })
})
