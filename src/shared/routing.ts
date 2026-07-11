import type { NavKey } from './layout/Sidebar'

const NAV_TO_PATH: Record<NavKey, string> = {
  dashboard: '/',
  tradejournal: '/trade-journal',
  tradermanagement: '/trader-management',
  playbooks: '/playbooks',
  cockpit: '/prop-firm-management',
  charting: '/charting',
  calendar: '/economic-calendar',
  tradelog: '/trade-log',
  tradecopier: '/trade-copier',
  brokers: '/broker-connections',
  insights: '/ai-insights',
}

const PATH_TO_NAV = Object.fromEntries(
  Object.entries(NAV_TO_PATH).map(([nav, path]) => [path, nav as NavKey]),
) as Record<string, NavKey>

export function pathForNav(nav: NavKey): string {
  return NAV_TO_PATH[nav]
}

/** Falls back to 'dashboard' for any unrecognized path (e.g. a stale bookmark). */
export function navForPath(path: string): NavKey {
  return PATH_TO_NAV[path] ?? 'dashboard'
}
