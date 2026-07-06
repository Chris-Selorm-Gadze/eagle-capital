import { useState } from 'react'
import { calendarCells, weekTotal, type DailyPnl } from '../../../utils/tradeAggregates'
import { COLOR_GOOD_LIGHT, COLOR_CRITICAL_LIGHT } from '../../../utils/chartTheme'
import styles from './CalendarHeatmap.module.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function weekTotalColor(pnl: number): string {
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

export function CalendarHeatmap({ daily }: { daily: DailyPnl[] }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const cells = calendarCells(daily, year, month)
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1)
  }

  return (
    <div className="card">
      <div className={styles.header}>
        <button onClick={prevMonth}>‹</button>
        <div className={styles.monthTitle}>{MONTH_NAMES[month]} {year}</div>
        <button onClick={nextMonth}>›</button>
      </div>
      <div className={styles.weekdayRow}>
        {WEEKDAYS.map((w) => <div key={w} className={styles.weekdayCell}>{w}</div>)}
        <div className={styles.weekLabelCell}>Week</div>
      </div>
      {weeks.map((week, i) => {
        const total = weekTotal(week)
        return (
          <div key={i} className={styles.weekRow}>
            {week.map((cell, j) => {
              const style = cellStyle(cell?.pnl ?? null)
              return (
                <div
                  key={j}
                  className={styles.dayCell}
                  style={{ background: cell ? style.background : 'transparent', color: style.color }}
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
            <div className={styles.weekTotalCell} style={{ color: weekTotalColor(total) }}>
              {total >= 0 ? '+' : '-'}${Math.abs(total).toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
