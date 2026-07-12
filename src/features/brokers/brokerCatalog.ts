export type AssetClass = 'cfd' | 'futures'

export interface BrokerInfo {
  id: string
  name: string
  // Undefined for brokers that don't fit one bucket cleanly (IBKR spans stocks/options/futures/
  // forex) or aren't a real integration yet ('other') — copier/account grouping treats these as
  // ungrouped rather than guessing at a category.
  assetClass?: AssetClass
}

export const BROKERS: BrokerInfo[] = [
  { id: 'tradovate', name: 'Tradovate', assetClass: 'futures' },
  { id: 'topstep', name: 'Topstep', assetClass: 'futures' },
  { id: 'rithmic', name: 'Rithmic', assetClass: 'futures' },
  { id: 'ibkr', name: 'Interactive Brokers' },
  { id: 'mt4', name: 'MetaTrader 4', assetClass: 'cfd' },
  { id: 'mt5', name: 'MetaTrader 5', assetClass: 'cfd' },
  { id: 'tradelocker', name: 'TradeLocker', assetClass: 'cfd' },
  { id: 'dxtrade', name: 'DXtrade', assetClass: 'cfd' },
  { id: 'other', name: 'Other' },
]

export function assetClassForBroker(brokerId: string): AssetClass | undefined {
  return BROKERS.find((b) => b.id === brokerId)?.assetClass
}
