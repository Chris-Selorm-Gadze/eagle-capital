import { useRef, useState } from 'react'
import { CameraIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DashboardCard } from '@/components/dashboard-card'
import { activate } from '@/shared/ui/activate'
import {
	calendarCells,
	weekTotal,
	monthTotal,
	type DailyPnl,
	type CalendarCell,
} from '@/utils/tradeAggregates'
import { downloadElementAsImage } from '@/utils/snapshot'
import styles from './CalendarHeatmap.module.css'

/* Converted off `.card` onto DashboardCard. The grid itself stays in module CSS
 * — a 7-plus-1 column calendar with a week-total rail is real layout work, and
 * no block in the free tier is shaped like it.
 *
 * What changed besides the shell: the month chevrons and the snapshot button are
 * shadcn buttons with lucide icons (the rest of the shell is lucide; this was the
 * only FontAwesome icon on the dashboard), and the cell tints are derived from
 * --good / --critical instead of two leftover rgba() literals from the old dark
 * palette that no longer matched the text colour sitting on them. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
]

function totalColor(pnl: number): string {
	if (pnl > 0) return 'var(--good-deep)'
	if (pnl < 0) return 'var(--critical-deep)'
	return 'var(--text-muted)'
}

/** A day's fill and the text that sits on it, both from the same token — so the
 * pair stays legible in either theme instead of a fixed tint under text that
 * flips. */
function cellStyle(pnl: number | null): { background: string; color: string } {
	if (pnl === null) return { background: 'var(--surface-2)', color: 'var(--text-muted)' }
	if (pnl > 0) {
		return {
			background: 'color-mix(in srgb, var(--good) 25%, transparent)',
			color: 'var(--good-deep)',
		}
	}
	if (pnl < 0) {
		return {
			background: 'color-mix(in srgb, var(--critical) 25%, transparent)',
			color: 'var(--critical-deep)',
		}
	}
	return { background: 'var(--surface-2)', color: 'var(--text-secondary)' }
}

function signedMoney(value: number): string {
	return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString()}`
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
		<DashboardCard className="md:col-span-2 lg:col-span-4" ref={cardRef}>
			<CardHeader>
				<CardTitle className="flex items-baseline gap-2.5">
					{MONTH_NAMES[month]} {year}
					<span
						className="font-semibold text-sm tabular-nums"
						style={{ color: totalColor(total) }}
					>
						{signedMoney(total)}
					</span>
				</CardTitle>
				{/* Excluded from the snapshot: the controls are chrome, not the month. */}
				<CardAction className="flex gap-1" data-snapshot-exclude="true">
					<Button aria-label="Previous month" onClick={prevMonth} size="icon-sm" variant="ghost">
						<ChevronLeftIcon />
					</Button>
					<Button aria-label="Next month" onClick={nextMonth} size="icon-sm" variant="ghost">
						<ChevronRightIcon />
					</Button>
					<Button
						aria-label="Download this month as an image"
						onClick={handleDownload}
						size="icon-sm"
						variant="ghost"
					>
						<CameraIcon />
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				<div className={styles.weekdayRow}>
					{WEEKDAYS.map((w) => <div className={styles.weekdayCell} key={w}>{w}</div>)}
					<div className={styles.weekLabelCell}>Week</div>
				</div>
				{weeks.map((week, i) => {
					const weekSum = weekTotal(week)
					return (
						<div className={styles.weekRow} key={i}>
							{week.map((cell, j) => {
								const style = cellStyle(cell?.pnl ?? null)
								const clickable = Boolean(cell && cell.tradeCount > 0)
								return (
									<div
										className={`${styles.dayCell} ${clickable ? styles.dayCellClickable : ''}`}
										key={j}
										style={{ background: cell ? style.background : 'transparent', color: style.color }}
										title={clickable ? "Open this day's trades in the Trade Journal" : undefined}
										{...activate(() => handleDayClick(cell), clickable)}
									>
										{cell && (
											<>
												<div>{cell.day}</div>
												{cell.pnl !== null && (
													<>
														<div className={styles.dayPnl}>{signedMoney(cell.pnl)}</div>
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
								{signedMoney(weekSum)}
							</div>
						</div>
					)
				})}
			</CardContent>
		</DashboardCard>
	)
}
