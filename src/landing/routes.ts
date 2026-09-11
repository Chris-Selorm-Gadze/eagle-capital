import { useEffect, useState } from 'react'
import { FEATURE_PAGES } from './content'

/* Public-site routing. Deliberately hand-rolled to match src/shared/routing.ts
 * — this app has no router library and the public surface is all static paths,
 * so a table plus the History API covers it. */

export type PublicPageKind =
  | 'home' | 'features' | 'feature' | 'how-it-works' | 'pricing'
  | 'security' | 'about' | 'faq' | 'roadmap' | 'disclaimer'
  | 'privacy' | 'terms'

export interface PublicLocation {
  kind: PublicPageKind
  /** Only set when kind === 'feature'. */
  slug?: string
}

export const AUTH_PATHS = ['/signin', '/signup', '/forgot-password', '/reset-password'] as const
export type AuthPath = (typeof AUTH_PATHS)[number]

const STATIC_ROUTES: Record<string, PublicPageKind> = {
  '/': 'home',
  '/features': 'features',
  '/how-it-works': 'how-it-works',
  '/pricing': 'pricing',
  '/security': 'security',
  '/about': 'about',
  '/faq': 'faq',
  '/roadmap': 'roadmap',
  '/disclaimer': 'disclaimer',
  '/privacy': 'privacy',
  '/terms': 'terms',
}

/** Trailing slashes are tolerated so a pasted "/pricing/" doesn't 404. */
function normalize(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

export function isAuthPath(path: string): path is AuthPath {
  return (AUTH_PATHS as readonly string[]).includes(normalize(path))
}

/** Returns null for anything that isn't a public marketing page — the caller
 * treats that as "probably an app route" and decides based on auth state. */
export function publicLocationFor(path: string): PublicLocation | null {
  const p = normalize(path)
  const staticKind = STATIC_ROUTES[p]
  if (staticKind) return { kind: staticKind }

  const featureMatch = /^\/features\/([a-z0-9-]+)$/.exec(p)
  if (featureMatch) {
    const slug = featureMatch[1]
    if (FEATURE_PAGES.some((f) => f.slug === slug)) return { kind: 'feature', slug }
  }
  return null
}

/* -------------------------------------------------------------- navigation */

const NAV_EVENT = 'eaglecapital:navigate'

/** Client-side navigation. Dispatches a custom event because pushState alone
 * fires nothing — usePath() listens for it as well as popstate. */
export function navigate(path: string): void {
  if (normalize(window.location.pathname) === normalize(path)) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event(NAV_EVENT))
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
}

/** Lets code that pushes history itself (App.tsx keeps its own nav effect)
 * tell usePath() subscribers the path moved. pushState fires no event. */
export function notifyPathChange(): void {
  window.dispatchEvent(new Event(NAV_EVENT))
}

/** Current pathname, re-rendering on back/forward and on navigate(). */
export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    function sync() {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', sync)
    window.addEventListener(NAV_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(NAV_EVENT, sync)
    }
  }, [])

  return path
}

/** Intercepts a left-click on an internal link so it routes client-side, while
 * leaving modified clicks (new tab, download) to the browser. */
export function handleLinkClick(e: React.MouseEvent, to: string): void {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  navigate(to)
}
