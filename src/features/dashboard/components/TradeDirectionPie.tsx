import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Trade } from '../../../db/schema'
import { longPct as longFraction } from '../../../utils/tradeStats'
import { TileShell } from '../../../shared/ui/TileShell'
import { COLOR_GOOD, COLOR_CRITICAL, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '../../../utils/chartTheme'
import styles from './TradeDirectionPie.module.css'

export function TradeDirectionPie({ trades }: { trades: Trade[] }) {
  const longCount = trades.filter((t) => t.side === 'long').length
  const shortCount = trades.length - longCount
  const hasData = trades.length > 0
  const longPct = Math.round(longFraction(trades) * 100)

  const data = hasData
    ? [{ name: 'Long', value: longCount }, { name: 'Short', value: shortCount }]
    : [{ name: 'No trades', value: 1 }]

  return (
    <TileShell label="Trade direction" info="Share of trades taken long vs. short.">
      <div className={styles.row}>
        <div>
          <div className={styles.legendRow}>
            <span className={`${styles.dot} ${styles.dotGood}`} />
            <span className={styles.pct}>{longPct}%</span>
            <span className={styles.legendLabel}>Long</span>
          </div>
          <div className={styles.legendRow}>
            <span className={`${styles.dot} ${styles.dotCritical}`} />
            <span className={styles.pct}>{hasData ? 100 - longPct : 0}%</span>
            <span className={styles.legendLabel}>Short</span>
          </div>
        </div>
        <div className={styles.pieWrap}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data} dataKey="value" nameKey="name"
                innerRadius={16} outerRadius={27} paddingAngle={hasData ? 3 : 0}
                stroke="var(--surface)" strokeWidth={2}
              >
                {hasData
                  ? [<Cell key="long" fill={COLOR_GOOD} />, <Cell key="short" fill={COLOR_CRITICAL} />]
                  : [<Cell key="none" fill="var(--surface-2)" />]}
              </Pie>
              {hasData && (
                <Tooltip
                  formatter={(value, name) => [`${Number(value)} trade${Number(value) === 1 ? '' : 's'}`, String(name)]}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </TileShell>
  )
}
