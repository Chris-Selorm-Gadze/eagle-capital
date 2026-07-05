import { useState } from 'react'
import { calendarCells, weekTotal, type DailyPnl } from '../lib/tradeAggregates'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GRID_COLUMNS = 'repeat(7, 1fr) minmax(64px, 0.9fr)'

function weekTotalStyle(pnl: number): { color: string } {
  if (pnl > 0) return { color: '#4ee44e' }
  if (pnl < 0) return { color: '#ff8080' }
  return { color: 'var(--text-muted)' }
}
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function cellStyle(pnl: number | null): { background: string; color: string } {
  if (pnl === null) return { background: 'var(--surface-2)', color: 'var(--text-muted)' }
  if (pnl > 0) return { background: 'rgba(12,163,12,0.25)', color: '#4ee44e' }
  if (pnl < 0) return { background: 'rgba(208,59,59,0.25)', color: '#ff8080' }
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <button onClick={prevMonth}>‹</button>
        <div style={{ fontWeight: 600 }}>{MONTH_NAMES[month]} {year}</div>
        <button onClick={nextMonth}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ textAlign: 'center' }}>{w}</div>)}
        <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)' }}>Week</div>
      </div>
      {weeks.map((week, i) => {
        const total = weekTotal(week)
        const totalStyle = weekTotalStyle(total)
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, gap: 6, marginBottom: 6 }}>
            {week.map((cell, j) => {
              const style = cellStyle(cell?.pnl ?? null)
              return (
                <div
                  key={j}
                  style={{
                    minHeight: 84, borderRadius: 4, padding: '0.4rem 0.5rem',
                    background: cell ? style.background : 'transparent',
                    color: style.color, fontSize: '0.85rem',
                  }}
                >
                  {cell && (
                    <>
                      <div>{cell.day}</div>
                      {cell.pnl !== null && (
                        <>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '0.2rem' }}>
                            {cell.pnl >= 0 ? '+' : '-'}${Math.abs(cell.pnl).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {cell.tradeCount} trade{cell.tradeCount === 1 ? '' : 's'}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            <div
              style={{
                minHeight: 84, borderRadius: 4, padding: '0.4rem 0.5rem', borderLeft: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                fontSize: '0.85rem', fontWeight: 600, color: totalStyle.color,
              }}
            >
              {total >= 0 ? '+' : '-'}${Math.abs(total).toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
