import { useEffect, useState } from 'react'
import type { ReportCard, Trade, TradingRule } from '../../types'
import { saveReportCard } from '../../db/reportCards'
import { listTradingRules } from '../../db/tradingRules'
import { todayISO } from '../../db/sessions'
import { errorMessage } from '../../utils/errors'
import { ScoreboardSection } from './components/ScoreboardSection'
import { ExecutionChecklist } from './components/ExecutionChecklist'
import { GradeSection } from './components/GradeSection'
import { FiveWhysSection } from './components/FiveWhysSection'
import { LedgerSection } from './components/LedgerSection'
import { TradeLinkSection } from './components/TradeLinkSection'
import styles from './ReportCardPage.module.css'
import { useConfirm } from '../../shared/ui/confirm'
import { useUnsavedWarning } from '../../shared/useUnsavedWarning'

const SECTIONS = [
  { id: 'sec-scoreboard', label: 'Scoreboard' },
  { id: 'sec-execution', label: 'Execution' },
  { id: 'sec-grade', label: 'Grade' },
  { id: 'sec-whys', label: '5 Whys' },
  { id: 'sec-ledger', label: 'Ledger' },
  { id: 'sec-trades', label: 'Trades' },
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

/** Every field a user can actually type into. `date`/`dayOfWeek` are excluded
 * because a blank form already has both. */
function hasContent(card: ReportCard): boolean {
  const { date: _date, dayOfWeek: _dow, ruleChecks, tradeIds, imageUrls, ...rest } = card
  if (Object.values(rest).some((v) => v !== undefined && v !== '' && v !== null)) return true
  if (ruleChecks && Object.keys(ruleChecks).length > 0) return true
  if (tradeIds && tradeIds.length > 0) return true
  if (imageUrls && imageUrls.length > 0) return true
  return false
}

/* Drafts survive a reload.
 *
 * This form holds the most writing anyone does in the app and had no
 * persistence of any kind — a refresh, an accidental back-press, or a crash
 * took the lot. The draft lives in localStorage (per browser, never sent
 * anywhere) and is cleared the moment the entry is saved for real. */
const DRAFT_KEY = 'eaglecapital:report-card-draft'

function readDraft(): ReportCard | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReportCard
    return parsed && typeof parsed.date === 'string' ? parsed : null
  } catch {
    return null // private mode, cleared storage, or a corrupt value
  }
}

function writeDraft(card: ReportCard): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(card))
  } catch {
    /* storage full or blocked — the form still works, it just won't survive a reload */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* nothing to do */
  }
}

function toText(card: ReportCard, trades: Trade[], rules: TradingRule[]): string {
  const checks = card.ruleChecks ?? {}
  const answered = rules.filter((r) => checks[r.id!] !== undefined)
  const followed = answered.filter((r) => checks[r.id!]).length
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
    `EXECUTION SCORE: ${followed}/${rules.length} rules followed`,
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
  const confirm = useConfirm()
  // A saved entry opened from Completed DRCs always wins over a local draft —
  // the user explicitly asked for that one.
  const [card, setCard] = useState<ReportCard>(() => openedCard ?? readDraft() ?? blankCard(todayISO()))
  const [savedMessage, setSavedMessage] = useState('')
  const [rules, setRules] = useState<TradingRule[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoredDraft] = useState(() => openedCard === null && readDraft() !== null)

  const unsaved = hasContent(card)
  useUnsavedWarning(unsaved && !saving)

  useEffect(() => {
    listTradingRules().then(setRules).catch(() => setRules([]))
  }, [])

  // Persist as the user types. Cheap (one small JSON blob) and it means the
  // beforeunload prompt is a safety net rather than the only line of defence.
  useEffect(() => {
    if (openedCard) return // viewing a saved entry, not composing
    if (unsaved) writeDraft(card)
    else clearDraft()
  }, [card, unsaved, openedCard])

  function patch(p: Partial<ReportCard>) {
    setCard((c) => ({ ...c, ...p }))
  }

  function flash(msg: string) {
    setSavedMessage(msg)
    setTimeout(() => setSavedMessage(''), 1600)
  }

  async function handleSave() {
    // This used to fail silently on any error (missing try/catch) — the form would just sit
    // there with no feedback, indistinguishable from a slow save. Real report-card data is worth
    // surfacing a real error for rather than losing quietly.
    setError(null)
    setSaving(true)
    try {
      await saveReportCard(userId, card)
      clearDraft()
      flash('SAVED')
      // The form used to be blanked here. It's an upsert keyed on (user, date),
      // so wiping the screen after a successful save just made it look like the
      // work had vanished — and made "save, then add one more thought"
      // impossible. The entry stays put; "Clear form" starts a new one.
      onSaved?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(toText(card, trades, rules))
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

  async function handleClear() {
    if (!(await confirm({ title: 'Clear the form?', description: 'Unsaved entries are lost.', confirmLabel: 'Clear form', destructive: true }))) return
    clearDraft()
    setCard(blankCard(todayISO()))
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

          {restoredDraft && !openedCard && (
            <div className={styles.openedBanner}>
              <span>Restored an unsaved draft from this browser. Save it to keep it.</span>
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

        <ScoreboardSection card={card} trades={trades} onChange={patch} />
        <ExecutionChecklist card={card} rules={rules} onChange={patch} />
        <GradeSection card={card} onChange={patch} />
        <FiveWhysSection card={card} onChange={patch} />
        <LedgerSection card={card} onChange={patch} />
        <TradeLinkSection card={card} trades={trades} userId={userId} onChange={patch} />

        <div className={styles.actions}>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save entry'}
          </button>
          <button type="button" onClick={handleCopy}>Copy as text</button>
          <button type="button" onClick={handleExport}>Export JSON</button>
          <button type="button" onClick={handleClear} className="btn-ghost">Clear form</button>
          <span className={`${styles.saved} ${savedMessage ? styles.savedShow : ''}`}>{savedMessage}</span>
        </div>
        {error && <div style={{ color: 'var(--critical)', marginTop: '0.75rem' }}>{error}</div>}

        <p className={styles.creed}>
          The market pays you for discipline and charges you for everything else.{' '}
          <span>Grade the process. Repeat the process. The money is a byproduct.</span>
        </p>
      </div>
    </div>
  )
}
