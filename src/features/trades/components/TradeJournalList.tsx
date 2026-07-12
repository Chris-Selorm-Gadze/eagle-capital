import type { Account, Trade } from '../../../types'
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

// Purely presentational — matches the outcome badge color, not a computed risk signal.
const OUTCOME_ACCENT: Record<ReturnType<typeof tradeOutcome>, string> = {
  win: 'var(--good)',
  loss: 'var(--critical)',
  breakeven: 'var(--text-muted)',
}

export function TradeJournalList({
  trades,
  accounts,
  accountFilter,
  onAccountFilterChange,
  selectedId,
  onSelect,
}: {
  trades: Trade[]
  accounts: Account[]
  // Independent of the Dashboard's own account filter (top bar) — lets you look at, say, all
  // accounts on the Dashboard while journaling just one account's trades here, or vice versa.
  accountFilter: string | 'all'
  onAccountFilterChange: (value: string | 'all') => void
  selectedId: string | undefined
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <select
        className={styles.accountSelect}
        value={accountFilter}
        onChange={(e) => onAccountFilterChange(e.target.value === 'all' ? 'all' : e.target.value)}
      >
        <option value="all">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.label}</option>
        ))}
      </select>
      <div className={styles.list}>
      {trades.map((t) => {
        const outcome = tradeOutcome(t.pnl)
        return (
          <div
            key={t.id}
            className={`${styles.row} ${t.id === selectedId ? styles.rowActive : ''}`}
            style={{ borderLeftColor: OUTCOME_ACCENT[outcome] }}
            onClick={() => onSelect(t.id!)}
          >
            <div className={styles.rowTop}>
              <span className={styles.symbol}>{t.symbol}</span>
              <span className={`${styles.outcome} ${OUTCOME_CLASS[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>
            </div>
            <div className={styles.rowBottom}>
              <span className={styles.rowMeta}>
                {t.date}
                <span className={`${styles.sideBadge} ${t.side === 'long' ? styles.sideLong : styles.sideShort}`}>{t.side}</span>
              </span>
              <span className={styles.pnl} style={{ color: t.pnl >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                {t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
