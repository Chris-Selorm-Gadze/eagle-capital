/* Which MT5 terminal a broker's account has to be opened with.
 *
 * This is not cosmetic. Every retail and prop broker ships its OWN MT5 build,
 * and the Python API must launch the matching `terminal64.exe` or the login
 * fails outright — wrong IPC, wrong server list. An FTMO account cannot be
 * driven through the Exness terminal.
 *
 * When `terminal_path` is left empty the worker calls mt5.initialize() without
 * a path, which attaches to whatever terminal happens to be running. On a
 * machine with four broker terminals installed that is a coin toss, and the
 * failure looks like a credentials problem rather than a path problem. So on a
 * multi-broker host, terminal_path is effectively required — this table is how
 * it gets filled in without anyone typing a Windows path from memory.
 *
 * Ported from delta_engine backend/app/data/mt5_brokers.py. The matching rules
 * below mirror match_broker_from_server() exactly, so the browser and the worker
 * agree on which broker a server name belongs to.
 */

export interface BrokerPreset {
  slug: string
  name: string
  /** Server names as they appear in the MT5 login dialog. Shown as suggestions,
   * never auto-submitted — a wrong server is an auth failure, not a fallback. */
  serverExamples: string[]
  /** In install order of likelihood. The first is used as the default. */
  terminalPaths: string[]
  /** Substrings used to recognise this broker from a server name. */
  searchTerms: string[]
  /** Confirmed against a real install. */
  verified: boolean
  note?: string
}

export const BROKER_PRESETS: BrokerPreset[] = [
  {
    slug: 'moneta_markets',
    name: 'Moneta Markets',
    serverExamples: ['MonetaMarkets-Demo', 'MonetaMarkets-Live'],
    terminalPaths: ['C:\\Program Files\\Moneta Markets MT5 Terminal\\terminal64.exe'],
    searchTerms: ['Moneta Markets', 'MonetaMarkets'],
    verified: true,
    note: 'Use the server name exactly as shown in your MT5 login dialog.',
  },
  {
    slug: 'ftmo',
    name: 'FTMO (MT5)',
    serverExamples: ['FTMO-Demo', 'FTMO-Server', 'FTMO-Demo2'],
    terminalPaths: [
      'C:\\Program Files\\FTMO Global Markets MT5 Terminal\\terminal64.exe',
      'C:\\Program Files\\FTMO MetaTrader 5\\terminal64.exe',
    ],
    searchTerms: ['FTMO'],
    verified: true,
    note: 'FTMO also offers DXtrade (web) — pick DXtrade as the platform for those accounts.',
  },
  {
    slug: 'exness',
    name: 'Exness',
    serverExamples: ['Exness-MT5Trial9', 'Exness-MT5Real9'],
    terminalPaths: ['C:\\Program Files\\MetaTrader 5 EXNESS\\terminal64.exe'],
    searchTerms: ['EXNESS', 'Exness'],
    verified: true,
    note: 'Exness demo and live server names vary by account — copy yours from the terminal.',
  },
  {
    slug: 'fusion_markets',
    name: 'Fusion Markets',
    serverExamples: ['FusionMarkets-Demo', 'FusionMarkets-Live', 'FusionMarkets-Live 2', 'FusionMarkets-Live 3'],
    terminalPaths: [
      'C:\\Program Files\\Fusion Markets MetaTrader 5\\terminal64.exe',
      'C:\\Program Files\\Fusion Markets MT5 Terminal\\terminal64.exe',
      'C:\\Program Files\\FusionMarkets MetaTrader 5\\terminal64.exe',
    ],
    searchTerms: ['Fusion Markets', 'FusionMarkets', 'Fusion'],
    verified: true,
    note: 'Needs the MT5 build. The copy engine does not drive Fusion’s MT4 terminal.',
  },
  {
    slug: 'generic',
    name: 'MetaQuotes (generic MT5)',
    serverExamples: [],
    terminalPaths: ['C:\\Program Files\\MetaTrader 5\\terminal64.exe'],
    searchTerms: ['MetaTrader 5'],
    verified: false,
    note: 'The official MetaQuotes build. Only works if your broker supports it.',
  },
  {
    slug: 'custom',
    name: 'Other broker',
    serverExamples: [],
    terminalPaths: [],
    searchTerms: [],
    verified: false,
    note: 'Enter the server name and terminal path exactly as your broker gives them.',
  },
]

export function getBrokerPreset(slug: string): BrokerPreset | undefined {
  return BROKER_PRESETS.find((b) => b.slug === slug)
}

/** Recognises a broker from an MT5 server name.
 *
 * Mirrors the Python `match_broker_from_server` precisely: server-name hints
 * first, then space-insensitive search terms. 'custom' is never matched — it is
 * the explicit escape hatch, not a fallback.
 */
export function matchBrokerFromServer(server: string): BrokerPreset | null {
  if (!server) return null
  const lower = server.toLowerCase()
  const squashed = lower.replace(/\s/g, '')

  for (const broker of BROKER_PRESETS) {
    if (broker.slug === 'custom') continue
    for (const hint of broker.serverExamples) {
      if (hint && lower.includes(hint.toLowerCase())) return broker
    }
    for (const term of broker.searchTerms) {
      if (term && squashed.includes(term.toLowerCase().replace(/\s/g, ''))) return broker
    }
  }
  return null
}

/** The install path to suggest for a server name, or '' when the broker is
 * unknown. Only ever a suggestion — the worker is the only thing that can
 * confirm a path exists, because the file is on its disk, not ours. */
export function defaultTerminalPath(server: string): string {
  return matchBrokerFromServer(server)?.terminalPaths[0] ?? ''
}

/** True when two accounts would share one MT5 terminal, and therefore make the
 * worker swap logins between them on every copied trade.
 *
 * This is the whole of `switch_ms`. Two accounts at DIFFERENT brokers already
 * have different terminals and cost nothing; two accounts at the SAME broker
 * share one install unless a second portable copy is made for one of them. */
export function sharesTerminal(pathA: string | null, pathB: string | null): boolean {
  if (!pathA || !pathB) return false
  const norm = (p: string) => p.trim().toLowerCase().replace(/\\+/g, '\\')
  return norm(pathA) === norm(pathB)
}
