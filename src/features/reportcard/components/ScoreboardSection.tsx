import type { ReportCard, Trade } from '../../../types'
import styles from '../ReportCardPage.module.css'

/** Derives the scoreboard from the trades already logged for that date.
 *
 * These seven numbers were pure manual entry even though the app holds every
 * trade they describe — so filling in a report card meant copying your own data
 * back to yourself. It stays a button rather than an automatic overwrite: the
 * card is the trader's account of the day, and some traders deliberately log a
 * session that doesn't match the raw fills. */
function scoreboardFrom(trades: Trade[]): Partial<ReportCard> {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl < 0)
  const net = trades.reduce((sum, t) => sum + t.pnl, 0)
  const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`

  let streak = 0
  let maxStreak = 0
  // Chronological, so the streak reflects the order they were actually taken.
  for (const t of [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))) {
    streak = t.pnl < 0 ? streak + 1 : 0
    if (streak > maxStreak) maxStreak = streak
  }

  return {
    tradesTaken: trades.length,
    wins: wins.length,
    losses: losses.length,
    netPnl: money(net),
    largestWin: wins.length ? money(Math.max(...wins.map((t) => t.pnl))) : '$0',
    largestLoss: losses.length ? money(Math.min(...losses.map((t) => t.pnl))) : '$0',
    maxConsecutiveLosses: maxStreak,
  }
}

export function ScoreboardSection({
  card,
  trades,
  onChange,
}: {
  card: ReportCard
  /** Every trade the user has logged; filtered to the card's date here. */
  trades: Trade[]
  onChange: (patch: Partial<ReportCard>) => void
}) {
  const todaysTrades = trades.filter((t) => t.date === card.date)

  return (
    <section className={styles.section} id="sec-scoreboard">
      <div className={styles.secHead}>
        <span className={styles.secNum}>01</span>
        <h2>Scoreboard</h2>
        <span className={styles.secNote}>Facts only. No story yet.</span>
      </div>
      <div className={styles.fillRow}>
        <button
          type="button"
          className="btn-ghost"
          disabled={todaysTrades.length === 0}
          onClick={() => onChange(scoreboardFrom(todaysTrades))}
        >
          Fill from logged trades
        </button>
        <span className={styles.fillHint}>
          {todaysTrades.length === 0
            ? 'No trades logged for this date.'
            : `${todaysTrades.length} trade${todaysTrades.length === 1 ? '' : 's'} logged on ${card.date}.`}
        </span>
      </div>
      <div className={styles.grid4}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Trades taken</span>
          <input type="number" value={card.tradesTaken ?? ''} onChange={(e) => onChange({ tradesTaken: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Wins</span>
          <input type="number" value={card.wins ?? ''} onChange={(e) => onChange({ wins: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Losses</span>
          <input type="number" value={card.losses ?? ''} onChange={(e) => onChange({ losses: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Net P&amp;L</span>
          <input type="text" value={card.netPnl ?? ''} onChange={(e) => onChange({ netPnl: e.target.value })} placeholder="$0" />
        </div>
      </div>
      <div className={styles.grid3}>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Largest win</span>
          <input type="text" value={card.largestWin ?? ''} onChange={(e) => onChange({ largestWin: e.target.value })} placeholder="$0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Largest loss</span>
          <input type="text" value={card.largestLoss ?? ''} onChange={(e) => onChange({ largestLoss: e.target.value })} placeholder="$0" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldKey}>Consecutive losses (max)</span>
          <input type="number" value={card.maxConsecutiveLosses ?? ''} onChange={(e) => onChange({ maxConsecutiveLosses: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="0" />
        </div>
      </div>
    </section>
  )
}
