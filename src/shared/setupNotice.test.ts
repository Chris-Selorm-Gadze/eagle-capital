import { describe, it, expect } from 'vitest'
import { buildSetupNotice, buildUnexpectedErrorMessage } from './setupNotice'

const PROD = false
const DEV = true

describe('buildSetupNotice', () => {
  it('names the variables a developer has to set', () => {
    expect(buildSetupNotice('Sign-in is unavailable.', ['VITE_SUPABASE_URL'], DEV))
      .toBe('Sign-in is unavailable. (Dev: set VITE_SUPABASE_URL in .env.local.)')
  })

  it('reads as a sentence with several variables', () => {
    expect(buildSetupNotice('Sign-in is unavailable.', ['VITE_A', 'VITE_B', 'VITE_C'], DEV))
      .toBe('Sign-in is unavailable. (Dev: set VITE_A, VITE_B and VITE_C in .env.local.)')
  })

  /* The point of the whole module: a deployed user is never shown the name of an
   * environment variable, a config file, or anything else about how the build is
   * wired. If this ever fails, the message is leaking again. */
  it('says nothing about the build in production', () => {
    const notice = buildSetupNotice(
      'Sign-in is temporarily unavailable. Please try again in a few minutes.',
      ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      PROD,
    )
    expect(notice).toBe('Sign-in is temporarily unavailable. Please try again in a few minutes.')
    expect(notice).not.toMatch(/VITE_|\.env|Dev:/)
  })

  it('leaves the message alone when there is nothing to name', () => {
    expect(buildSetupNotice('Unavailable.', [], DEV)).toBe('Unavailable.')
  })
})

describe('buildUnexpectedErrorMessage', () => {
  it('keeps the real message in a dev build', () => {
    expect(buildUnexpectedErrorMessage("Cannot read properties of undefined (reading 'map')", 'Something broke.', DEV))
      .toBe("Cannot read properties of undefined (reading 'map')")
  })

  it('falls back when the thrown value had no message', () => {
    expect(buildUnexpectedErrorMessage('', 'Something broke.', DEV)).toBe('Something broke.')
  })

  it('never shows the raw message in production', () => {
    expect(buildUnexpectedErrorMessage('duplicate key value violates unique constraint "trades_pkey"', 'Something broke.', PROD))
      .toBe('Something broke.')
  })
})
