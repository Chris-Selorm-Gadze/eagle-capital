import type { NavKey } from './layout/Sidebar'

const NAV_TO_PATH: Record<NavKey, string> = {
  dashboard: '/dashboard',
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
  livepositions: '/live-positions',
}

const PATH_TO_NAV = Object.fromEntries(
  Object.entries(NAV_TO_PATH).map(([nav, path]) => [path, nav as NavKey]),
) as Record<string, NavKey>

export function pathForNav(nav: NavKey): string {
  return NAV_TO_PATH[nav]
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** True for paths the authenticated app owns. Derived from the nav table
 * above so adding a page to the sidebar can't leave this list behind. */
export function isAppPath(path: string): boolean {
  return stripTrailingSlash(path) in PATH_TO_NAV
}

/** Falls back to 'dashboard' for any unrecognized path (e.g. a stale bookmark).
 * Note '/' is the public landing page now, not the dashboard — AuthGate routes
 * that away before this is ever called with it. */
export function navForPath(path: string): NavKey {
  return PATH_TO_NAV[stripTrailingSlash(path)] ?? 'dashboard'
}
