import { TradingViewWidget } from '../../../charting/components/TradingViewWidget'

export function TradeChartTab({ symbol }: { symbol: string }) {
  return (
    <div style={{ height: '480px' }}>
      <TradingViewWidget symbol={symbol} />
    </div>
  )
}
