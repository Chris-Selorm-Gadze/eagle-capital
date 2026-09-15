import { describe, it, expect } from 'vitest'
import {
  BROKER_PRESETS, getBrokerPreset, matchBrokerFromServer,
  defaultTerminalPath, sharesTerminal,
} from './brokerPresets'

/* These rules have to agree with delta_engine's match_broker_from_server(),
 * because the browser suggests a terminal path and the worker is what actually
 * launches it. A disagreement means an account opens against the wrong broker's
 * terminal and fails to log in — which reads as a bad password, not a bad path. */

describe('matchBrokerFromServer', () => {
  it('matches the four brokers installed on the worker machine', () => {
    expect(matchBrokerFromServer('MonetaMarkets-Live')?.slug).toBe('moneta_markets')
    expect(matchBrokerFromServer('FTMO-Server')?.slug).toBe('ftmo')
    expect(matchBrokerFromServer('Exness-MT5Real9')?.slug).toBe('exness')
    expect(matchBrokerFromServer('FusionMarkets-Live 3')?.slug).toBe('fusion_markets')
  })

  it('is case-insensitive', () => {
    expect(matchBrokerFromServer('ftmo-demo')?.slug).toBe('ftmo')
    expect(matchBrokerFromServer('EXNESS-MT5TRIAL9')?.slug).toBe('exness')
  })

  it('matches a server name that is not in the examples list', () => {
    // Server names drift — FTMO-Demo7 is not listed, but the search term catches it.
    expect(matchBrokerFromServer('FTMO-Demo7')?.slug).toBe('ftmo')
    expect(matchBrokerFromServer('MonetaMarkets-Live17')?.slug).toBe('moneta_markets')
  })

  it('ignores spacing, matching the Python rule', () => {
    expect(matchBrokerFromServer('Fusion Markets-Live')?.slug).toBe('fusion_markets')
  })

  it('returns null for an unknown broker rather than guessing', () => {
    // Guessing here would hand the worker the wrong terminal, and the failure
    // would look like bad credentials.
    expect(matchBrokerFromServer('PepperstoneUK-Live')).toBeNull()
    expect(matchBrokerFromServer('')).toBeNull()
  })

  it('never matches the custom escape hatch', () => {
    for (const p of BROKER_PRESETS) {
      if (p.slug === 'custom') continue
      const match = matchBrokerFromServer(p.serverExamples[0] ?? 'zzz-nothing')
      expect(match?.slug).not.toBe('custom')
    }
  })
})

describe('defaultTerminalPath', () => {
  it('suggests each broker’s own build — they are not interchangeable', () => {
    expect(defaultTerminalPath('FTMO-Demo')).toBe('C:\\Program Files\\FTMO Global Markets MT5 Terminal\\terminal64.exe')
    expect(defaultTerminalPath('Exness-MT5Real9')).toBe('C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe')
    expect(defaultTerminalPath('MonetaMarkets-Live')).toBe('C:\\Program Files\\Moneta Markets MT5 Terminal\\terminal64.exe')
    expect(defaultTerminalPath('FusionMarkets-Demo')).toBe('C:\\Program Files\\Fusion Markets MetaTrader 5\\terminal64.exe')
  })

  it('gives every known broker a distinct path', () => {
    const paths = BROKER_PRESETS
      .filter((b) => b.terminalPaths.length > 0)
      .map((b) => b.terminalPaths[0])
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('returns empty for an unknown broker so the field stays blank', () => {
    expect(defaultTerminalPath('PepperstoneUK-Live')).toBe('')
  })
})

describe('sharesTerminal', () => {
  it('is false across different brokers — the good case, no login switching', () => {
    expect(sharesTerminal(defaultTerminalPath('FTMO-Demo'), defaultTerminalPath('Exness-MT5Real9'))).toBe(false)
  })

  it('is true for two accounts at the same broker — this is what costs switch_ms', () => {
    expect(sharesTerminal(defaultTerminalPath('FTMO-Demo'), defaultTerminalPath('FTMO-Server'))).toBe(true)
  })

  it('ignores case and duplicated separators', () => {
    expect(sharesTerminal('C:\\Program Files\\FTMO MetaTrader 5\\terminal64.exe',
                          'c:\\program files\\ftmo metatrader 5\\terminal64.exe')).toBe(true)
  })

  it('treats an unset path as not shared, since nothing is known about it', () => {
    expect(sharesTerminal(null, 'C:\\MT5\\a\\terminal64.exe')).toBe(false)
    expect(sharesTerminal(null, null)).toBe(false)
  })
})

describe('getBrokerPreset', () => {
  it('finds by slug and returns undefined otherwise', () => {
    expect(getBrokerPreset('ftmo')?.name).toBe('FTMO (MT5)')
    expect(getBrokerPreset('nope')).toBeUndefined()
  })
})
