import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCamera } from '@fortawesome/free-solid-svg-icons'
import { calendarCells, weekTotal, monthTotal, type DailyPnl, type CalendarCell } from '../../../utils/tradeAggregates'
import { COLOR_GOOD_LIGHT, COLOR_CRITICAL_LIGHT } from '../../../utils/chartTheme'
import { downloadElementAsImage } from '../../../utils/snapshot'
import styles from './CalendarHeatmap.module.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function totalColor(pnl: number): string {
  if (pnl > 0) return COLOR_GOOD_LIGHT
  if (pnl < 0) return COLOR_CRITICAL_LIGHT
  return 'var(--text-muted)'
}

function cellStyle(pnl: number | null): { background: string; color: string } {
  if (pnl === null) return { background: 'var(--surface-2)', color: 'var(--text-muted)' }
  if (pnl > 0) return { background: 'rgba(12,163,12,0.25)', color: COLOR_GOOD_LIGHT }
  if (pnl < 0) return { background: 'rgba(208,59,59,0.25)', color: COLOR_CRITICAL_LIGHT }
  return { background: 'var(--surface-2)', color: 'var(--text-secondary)' }
}

export function CalendarHeatmap({
  daily,
  onOpenDateInJournal,
}: {
  daily: DailyPnl[]
  onOpenDateInJournal: (date: string) => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const cardRef = useRef<HTMLDivElement>(null)

  const cells = calendarCells(daily, year, month)
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const total = monthTotal(cells)

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1)
  }

  async function handleDownload() {
    if (!cardRef.current) return
    await downloadElementAsImage(
      cardRef.current,
      `eaglecapital-calendar-${MONTH_NAMES[month].toLowerCase()}-${year}.png`,
      { filter: (domNode) => !(domNode instanceof HTMLElement && domNode.dataset.snapshotExclude === 'true') },
    )
  }

  function handleDayClick(cell: CalendarCell | null) {
    if (!cell || cell.tradeCount === 0) return
    onOpenDateInJournal(cell.date)
  }

  return (
    <div className="card" ref={cardRef}>
      <div className={styles.header}>
        <button type="button" onClick={prevMonth} data-snapshot-exclude="true">‹</button>
        <div className={styles.monthTitleGroup}>
          <div className={styles.monthTitle}>{MONTH_NAMES[month]} {year}</div>
          <div className={styles.monthTotal} style={{ color: totalColor(total) }}>
            {total >= 0 ? '+' : '-'}${Math.abs(total).toLocaleString()}
          </div>
        </div>
        <div className={styles.headerActions} data-snapshot-exclude="true">
          <button type="button" onClick={nextMonth}>›</button>
          <button type="button" onClick={handleDownload} className={styles.downloadBtn} title="Download this month as an image">
            <FontAwesomeIcon icon={faCamera} />
          </button>
        </div>
      </div>
      <div className={styles.weekdayRow}>
        {WEEKDAYS.map((w) => <div key={w} className={styles.weekdayCell}>{w}</div>)}
        <div className={styles.weekLabelCell}>Week</div>
      </div>
      {weeks.map((week, i) => {
        const weekSum = weekTotal(week)
        return (
          <div key={i} className={styles.weekRow}>
            {week.map((cell, j) => {
              const style = cellStyle(cell?.pnl ?? null)
              const clickable = Boolean(cell && cell.tradeCount > 0)
              return (
                <div
                  key={j}
                  className={`${styles.dayCell} ${clickable ? styles.dayCellClickable : ''}`}
                  style={{ background: cell ? style.background : 'transparent', color: style.color }}
                  onClick={() => handleDayClick(cell)}
                  title={clickable ? 'Open this day\'s trades in the Trade Journal' : undefined}
                >
                  {cell && (
                    <>
                      <div>{cell.day}</div>
                      {cell.pnl !== null && (
                        <>
                          <div className={styles.dayPnl}>
                            {cell.pnl >= 0 ? '+' : '-'}${Math.abs(cell.pnl).toLocaleString()}
                          </div>
                          <div className={styles.dayTradeCount}>
                            {cell.tradeCount} trade{cell.tradeCount === 1 ? '' : 's'}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            <div className={styles.weekTotalCell} style={{ color: totalColor(weekSum) }}>
              {weekSum >= 0 ? '+' : '-'}${Math.abs(weekSum).toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
