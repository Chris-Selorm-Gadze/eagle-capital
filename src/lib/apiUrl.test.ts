import { describe, it, expect } from 'vitest'
import { isUsableApiUrl } from './apiUrl'

/* The bug this guards against: every backend client gated on `Boolean(apiUrl)`,
 * which is true for "http://localhost:8787". In production that made the Trade
 * Copier, Live Positions and Broker Connections pages render their full UI over
 * a host that does not exist outside a developer's machine — the features looked
 * available and silently failed on every request. */

describe('isUsableApiUrl', () => {
  it('rejects an unset or blank variable in both builds', () => {
    expect(isUsableApiUrl(undefined, false)).toBe(false)
    expect(isUsableApiUrl('', true)).toBe(false)
    expect(isUsableApiUrl('   ', true)).toBe(false)
  })

  it('accepts localhost in development, where it is the correct setting', () => {
    expect(isUsableApiUrl('http://localhost:8787', false)).toBe(true)
    expect(isUsableApiUrl('http://127.0.0.1:8000', false)).toBe(true)
  })

  it('rejects localhost in a production build — the original bug', () => {
    expect(isUsableApiUrl('http://localhost:8787', true)).toBe(false)
    expect(isUsableApiUrl('http://127.0.0.1:8000', true)).toBe(false)
    expect(isUsableApiUrl('http://0.0.0.0:3000', true)).toBe(false)
    // URL.hostname returns "[::1]" with brackets — an earlier version of this
    // check compared against "::1" and let the loopback through.
    expect(isUsableApiUrl('http://[::1]:8000', true)).toBe(false)
  })

  it('accepts a real deployed host in production', () => {
    expect(isUsableApiUrl('https://eaglecapital-broker-sync.example.com', true)).toBe(true)
  })

  it('rejects a value that is not a URL at all', () => {
    expect(isUsableApiUrl('broker-sync.example.com', true)).toBe(false)
    expect(isUsableApiUrl('set-me-later', true)).toBe(false)
  })

  it('rejects non-http schemes', () => {
    expect(isUsableApiUrl('ws://example.com', true)).toBe(false)
    expect(isUsableApiUrl('file:///tmp/api', false)).toBe(false)
  })
})
