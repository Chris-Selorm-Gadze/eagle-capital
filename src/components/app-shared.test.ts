import { describe, expect, it } from 'vitest'
import { navGroups, navItemFor, visibleNavGroups } from './app-shared'

const ALL = { brokerSync: true }
const NONE = { brokerSync: false }

function keysOf(groups: ReturnType<typeof visibleNavGroups>): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.key))
}

describe('visibleNavGroups', () => {
  it('shows every page when the optional backends are reachable', () => {
    expect(keysOf(visibleNavGroups(ALL))).toEqual(keysOf(navGroups))
  })

  it('hides the pages served by the parked broker-sync service', () => {
    const keys = keysOf(visibleNavGroups(NONE))
    expect(keys).not.toContain('brokers')
  })

  it('keeps Live Trading, which reads the worker snapshots rather than that service', () => {
    expect(keysOf(visibleNavGroups(NONE))).toContain('livepositions')
  })

  it('leaves every other page alone', () => {
    const hidden = keysOf(visibleNavGroups(ALL)).filter(
      (k) => !keysOf(visibleNavGroups(NONE)).includes(k),
    )
    // The blast radius of parking a backend, stated as a list. A page landing
    // here by accident is a page that silently vanished from the sidebar.
    expect(hidden).toEqual(['brokers'])
  })

  it('drops a group whose every item is unavailable', () => {
    // Otherwise a heading renders above nothing. No group is all-optional
    // today, so this pins the filtering rather than a current arrangement.
    for (const group of visibleNavGroups(NONE)) {
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('keeps the dashboard reachable with nothing configured', () => {
    expect(keysOf(visibleNavGroups(NONE))).toContain('dashboard')
  })
})

describe('navItemFor', () => {
  it('still names a parked page, so a bookmark to one is not labelled Dashboard', () => {
    // Deliberately resolved from the full list: hiding a page from the sidebar
    // must not break the breadcrumb of a URL someone already has.
    expect(navItemFor('livepositions')?.title).toBe('Live Trading')
    expect(navItemFor('brokers')?.title).toBe('Broker Connections')
  })
})
