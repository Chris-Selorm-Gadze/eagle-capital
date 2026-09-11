import { describe, it, expect } from 'vitest'
import { publicLocationFor, isAuthPath } from './routes'
import { isAppPath, navForPath, pathForNav } from '../shared/routing'

describe('publicLocationFor', () => {
  it('resolves the marketing pages', () => {
    expect(publicLocationFor('/')).toEqual({ kind: 'home' })
    expect(publicLocationFor('/features')).toEqual({ kind: 'features' })
    expect(publicLocationFor('/pricing')).toEqual({ kind: 'pricing' })
    expect(publicLocationFor('/disclaimer')).toEqual({ kind: 'disclaimer' })
  })

  it('tolerates a trailing slash', () => {
    expect(publicLocationFor('/pricing/')).toEqual({ kind: 'pricing' })
  })

  it('resolves feature detail pages by slug', () => {
    expect(publicLocationFor('/features/trade-copier')).toEqual({
      kind: 'feature',
      slug: 'trade-copier',
    })
  })

  // A slug that isn't in the catalogue must not resolve, or the detail page
  // would render empty instead of the site's 404.
  it('rejects an unknown feature slug', () => {
    expect(publicLocationFor('/features/not-a-feature')).toBeNull()
  })

  it('returns null for app routes and unknown paths', () => {
    expect(publicLocationFor('/dashboard')).toBeNull()
    expect(publicLocationFor('/trade-journal')).toBeNull()
    expect(publicLocationFor('/nonsense')).toBeNull()
  })
})

describe('isAuthPath', () => {
  it('matches only the auth routes', () => {
    expect(isAuthPath('/signin')).toBe(true)
    expect(isAuthPath('/signup')).toBe(true)
    expect(isAuthPath('/signin/')).toBe(true)
    expect(isAuthPath('/')).toBe(false)
    expect(isAuthPath('/dashboard')).toBe(false)
  })
})

describe('isAppPath', () => {
  // '/' belongs to the landing site now — the app moved to '/dashboard'.
  it('no longer claims the site root', () => {
    expect(isAppPath('/')).toBe(false)
    expect(isAppPath('/dashboard')).toBe(true)
  })

  it('covers every nav destination', () => {
    for (const path of ['/trade-journal', '/playbooks', '/ai-insights', '/broker-connections']) {
      expect(isAppPath(path)).toBe(true)
    }
  })

  it('rejects marketing and unknown paths', () => {
    expect(isAppPath('/pricing')).toBe(false)
    expect(isAppPath('/nonsense')).toBe(false)
  })
})

describe('nav <-> path mapping', () => {
  it('round-trips', () => {
    expect(navForPath(pathForNav('dashboard'))).toBe('dashboard')
    expect(navForPath(pathForNav('tradejournal'))).toBe('tradejournal')
  })

  it('points the dashboard at /dashboard', () => {
    expect(pathForNav('dashboard')).toBe('/dashboard')
  })
})

describe('legal pages', () => {
  it('resolves /privacy and /terms as marketing pages', () => {
    expect(publicLocationFor('/privacy')).toEqual({ kind: 'privacy' })
    expect(publicLocationFor('/terms')).toEqual({ kind: 'terms' })
  })

  it('does not treat them as app routes', () => {
    expect(isAppPath('/privacy')).toBe(false)
    expect(isAppPath('/terms')).toBe(false)
  })
})

describe('password-recovery routes', () => {
  it('treats them as auth routes, not marketing or app routes', () => {
    for (const path of ['/forgot-password', '/reset-password']) {
      expect(isAuthPath(path)).toBe(true)
      expect(publicLocationFor(path)).toBeNull()
      expect(isAppPath(path)).toBe(false)
    }
  })

  it('keeps the original auth routes working', () => {
    expect(isAuthPath('/signin')).toBe(true)
    expect(isAuthPath('/signup')).toBe(true)
  })
})

describe('settings route', () => {
  it('is an app route and round-trips', () => {
    expect(isAppPath('/settings')).toBe(true)
    expect(navForPath('/settings')).toBe('settings')
    expect(pathForNav('settings')).toBe('/settings')
  })
})
