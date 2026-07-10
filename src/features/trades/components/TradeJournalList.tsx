import type { Trade } from '../../../types'
import { tradeOutcome } from '../../../utils/tradeStats'
import styles from './TradeJournalList.module.css'

const OUTCOME_CLASS: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: styles.outcomeWin,
  loss: styles.outcomeLoss,
  breakeven: styles.outcomeBreakeven,
}

const OUTCOME_LABEL: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'WIN',
  loss: 'LOSS',
  breakeven: 'BE',
}

export function TradeJournalList({
  trades,
  selectedId,
  onSelect,
}: {
  trades: Trade[]
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  return (
    <div className={styles.list}>
      {trades.map((t) => {
        const outcome = tradeOutcome(t.pnl)
        return (
          <div
            key={t.id}
            className={`${styles.row} ${t.id === selectedId ? styles.rowActive : ''}`}
            onClick={() => onSelect(t.id!)}
          >
            <div className={styles.rowTop}>
              <span className={styles.symbol}>{t.symbol}</span>
              <span className={`${styles.outcome} ${OUTCOME_CLASS[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
            </div>
            <div className={styles.rowBottom}>
              <span>{t.date} · {t.side}</span>
              <span className={styles.pnl} style={{ color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
