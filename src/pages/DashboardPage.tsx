import type { Trade } from '../db/schema'
import { dailyPnlSeries } from '../lib/tradeAggregates'
import { KpiRow } from '../components/KpiRow'
import { TradeStatsGrid } from '../components/TradeStatsGrid'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { CumulativePnlChart } from '../components/CumulativePnlChart'
import { DailyPnlBarChart } from '../components/DailyPnlBarChart'
import { TradeTimeScatter } from '../components/TradeTimeScatter'
import { TradeDurationScatter } from '../components/TradeDurationScatter'
import { RecentTradesTable } from '../components/RecentTradesTable'

export function DashboardPage({ trades }: { trades: Trade[] }) {
  const daily = dailyPnlSeries(trades)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <KpiRow trades={trades} />

      <TradeStatsGrid trades={trades} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <CalendarHeatmap daily={daily} />
        <CumulativePnlChart daily={daily} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <DailyPnlBarChart daily={daily} />
        <RecentTradesTable trades={trades} limit={8} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1rem' }}>
        <TradeTimeScatter trades={trades} />
        <TradeDurationScatter trades={trades} />
      </div>
    </div>
  )
}
