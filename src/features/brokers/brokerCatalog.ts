export interface BrokerInfo {
  id: string
  name: string
}

export const BROKERS: BrokerInfo[] = [
  { id: 'tradovate', name: 'Tradovate' },
  { id: 'rithmic', name: 'Rithmic' },
  { id: 'ibkr', name: 'Interactive Brokers' },
  { id: 'mt4', name: 'MetaTrader 4' },
  { id: 'mt5', name: 'MetaTrader 5' },
  { id: 'tradelocker', name: 'TradeLocker' },
  { id: 'dxtrade', name: 'DXtrade' },
  { id: 'other', name: 'Other' },
]
