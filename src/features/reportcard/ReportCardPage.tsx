import { useState } from 'react'
import type { ReportCard, Trade } from '../../types'
import { saveReportCard } from '../../db/reportCards'
import { todayISO } from '../../db/sessions'
import { ScoreboardSection } from './components/ScoreboardSection'
import { ExecutionChecklist } from './components/ExecutionChecklist'
import { GradeSection } from './components/GradeSection'
import { FiveWhysSection } from './components/FiveWhysSection'
import { LedgerSection } from './components/LedgerSection'
import { TradeLinkSection } from './components/TradeLinkSection'
import styles from './ReportCardPage.module.css'

const SECTIONS = [
  { id: 'sec-trades', label: 'Trades' },
  { id: 'sec-scoreboard', label: 'Scoreboard' },
  { id: 'sec-execution', label: 'Execution' },
  { id: 'sec-grade', label: 'Grade' },
  { id: 'sec-whys', label: '5 Whys' },
  { id: 'sec-ledger', label: 'Ledger' },
]

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function dayOfWeekFor(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
}

function blankCard(date: string): ReportCard {
  return { date, dayOfWeek: dayOfWeekFor(date) }
}

function toText(card: ReportCard, trades: Trade[]): string {
  const rules = [card.rule1, card.rule2, card.rule3, card.rule4, card.rule5, card.rule6, card.rule7, card.rule8, card.rule9, card.rule10]
  const followed = rules.filter(Boolean).length
  const tradeById = new Map(trades.map((t) => [t.id, t]))
  const linkedTrades = (card.tradeIds ?? []).map((id) => tradeById.get(id)).filter((t): t is Trade => !!t)
  return [
    `DAILY REPORT CARD — ${card.date} (${card.dayOfWeek ?? ''})`,
    `Instrument: ${card.instrument ?? ''}   Session: ${card.session ?? ''}`,
    ...(linkedTrades.length > 0
      ? ['', `TRADES ATTACHED`, ...linkedTrades.map((t) => `${t.symbol} · ${t.date} · ${t.pnl >= 0 ? '+' : '-'}$${Math.abs(t.pnl).toLocaleString()}`)]
      : []),
    ``,
    `SCOREBOARD`,
    `Trades ${card.tradesTaken ?? ''} | W ${card.wins ?? ''} | L ${card.losses ?? ''} | Net ${card.netPnl ?? ''}`,
    `Largest win ${card.largestWin ?? ''} | Largest loss ${card.largestLoss ?? ''} | Max loss streak ${card.maxConsecutiveLosses ?? ''}`,
    ``,
    `EXECUTION SCORE: ${followed}/10 rules followed`,
    `GRADE: ${card.grade ?? '—'}`,
    `Fit state? ${card.fitState ?? ''}`,
    `Plan or feelings? ${card.planOrFeelings ?? ''}`,
    ``,
    `THE 5 WHYS`,
    `Problem: ${card.whyProblem ?? ''}`,
    `Why 1: ${card.why1 ?? ''}`,
    `Why 2: ${card.why2 ?? ''}`,
    `Why 3: ${card.why3 ?? ''}`,
    `Why 4: ${card.why4 ?? ''}`,
    `Why 5: ${card.why5 ?? ''}`,
    `ROOT CAUSE: ${card.rootCause ?? ''}`,
    `COUNTER-MEASURE: ${card.counterMeasure ?? ''}`,
    ``,
    `LEDGER`,
    `Did well: ${card.didWell ?? ''}`,
    `Must improve: ${card.mustImprove ?? ''}`,
    `Passed on (correctly): ${card.passedSetup ?? ''}`,
    `Trade tomorrow? ${card.allowedTomorrow ?? ''}`,
    `Note to tomorrow: ${card.noteToTomorrow ?? ''}`,
  ].join('\n')
}

export function ReportCardPage({
  userId,
  trades,
  openedCard,
  onClose,
  onSaved,
}: {
  userId: string
  trades: Trade[]
  /** A specific saved entry the user explicitly opened from Completed DRCs — null means a
   * fresh blank compose box. Saved data only ever enters this form via this prop; nothing
   * here fetches from the server on its own. */
  openedCard: ReportCard | null
  /** Only meaningful while viewing an opened entry — clears back to a blank compose box. */
  onClose?: () => void
  onSaved?: () => void
}) {
  const [card, setCard] = useState<ReportCard>(() => openedCard ?? blankCard(todayISO()))
  const [savedMessage, setSavedMessage] = useState('')

  function patch(p: Partial<ReportCard>) {
    setCard((c) => ({ ...c, ...p }))
  }

  function flash(msg: string) {
    setSavedMessage(msg)
    setTimeout(() => setSavedMessage(''), 1600)
  }

  async function handleSave() {
    await saveReportCard(userId, card)
    flash('SAVED')
    setCard(blankCard(todayISO()))
    onSaved?.()
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(toText(card, trades))
    flash('COPIED')
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-card-${card.date}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleClear() {
    if (!confirm('Clear the form? Unsaved entries are lost.')) return
    setCard(blankCard(card.date))
  }

  function handleDateChange(newDate: string) {
    patch({ date: newDate, dayOfWeek: dayOfWeekFor(newDate) })
  }

  return (
    <div>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>End of session · Post-close review</div>
          <p className={styles.sub}>
            Fill this out after the close, before you leave the desk. Grade the process, not the P&amp;L. The 5 Whys
            section is the one that changes you — do not skip it, and do not stop at the first answer.
          </p>

          {openedCard && (
            <div className={styles.openedBanner}>
              <span>Viewing saved entry from {openedCard.date}</span>
              {onClose && <button type="button" className="btn-ghost" onClick={onClose}>Close</button>}
            </div>
          )}

          <div className={styles.meta}>
            <label>
              <span className={styles.metaKey}>Date</span>
              <input type="date" value={card.date} onChange={(e) => handleDateChange(e.target.value)} />
            </label>
            <label>
              <span className={styles.metaKey}>Instrument</span>
              <input type="text" value={card.instrument ?? ''} onChange={(e) => patch({ instrument: e.target.value })} placeholder="NQ / NAS100" />
            </label>
            <label>
              <span className={styles.metaKey}>Session</span>
              <input type="text" value={card.session ?? ''} onChange={(e) => patch({ session: e.target.value })} placeholder="New York" />
            </label>
          </div>
        </header>

        <nav className={styles.sectionNav}>
          <div className={styles.sectionNavLinks}>
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className={styles.sectionNavItem} onClick={() => scrollToSection(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost" onClick={handleClear}>Clear form</button>
        </nav>

        <TradeLinkSection card={card} trades={trades} userId={userId} onChange={patch} />
        <ScoreboardSection card={card} onChange={patch} />
        <ExecutionChecklist card={card} onChange={patch} />
        <GradeSection card={card} onChange={patch} />
        <FiveWhysSection card={card} onChange={patch} />
        <LedgerSection card={card} onChange={patch} />

        <div className={styles.actions}>
          <button type="button" className="btn-primary" onClick={handleSave}>Save entry</button>
          <button type="button" onClick={handleCopy}>Copy as text</button>
          <button type="button" onClick={handleExport}>Export JSON</button>
          <button type="button" onClick={handleClear} className="btn-ghost">Clear form</button>
          <span className={`${styles.saved} ${savedMessage ? styles.savedShow : ''}`}>{savedMessage}</span>
        </div>

        <p className={styles.creed}>
          The market pays you for discipline and charges you for everything else.{' '}
          <span>Grade the process. Repeat the process. The money is a byproduct.</span>
        </p>
      </div>
    </div>
  )
}
