import type { Trade } from '../../../types'
import { TradeChartTab } from './tabs/TradeChartTab'
import styles from './TradeChartPanel.module.css'

/** The third pane — chart stays fixed here regardless of which tab is active in the middle
 * pane (Stats/Strategy/Tags/Notes), so it's always visible alongside whatever else you're
 * looking at for the selected trade, not something you have to tab away to see. */
export function TradeChartPanel({ trade }: { trade: Trade }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Chart</span>
        <span className={styles.symbol}>{trade.symbol}</span>
      </div>
      <div className={styles.body}>
        <TradeChartTab trade={trade} />
      </div>
    </div>
  )
}
