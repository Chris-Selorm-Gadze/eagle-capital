import { useState } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis } from 'recharts'
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { DashboardCard } from '@/components/dashboard-card'
import type { Trade } from '@/db/schema'
import { ChartTooltipRow } from './ChartTooltipRow'
import { useMoney } from '@/components/money-context'

/* Converted off bare Recharts + `.card` onto the shared ChartContainer. The
 * timezone toggle was two module-CSS buttons whose active state was being
 * silently overridden by theme.css's element floor — both chips rendered
 * identically, so you couldn't tell which clock you were reading. It's a pair of
 * shadcn buttons now, where the selected one is a different variant. */

type TimeZoneMode = 'local' | 'ny'

const HOUR_TICKS = Array.from({ length: 25 }, (_, i) => i)

const chartConfig = {
	win: { label: 'Win', color: 'var(--good)' },
	loss: { label: 'Loss', color: 'var(--critical)' },
} satisfies ChartConfig

function formatHourLabel(v: number): string {
	const h = Math.floor(v)
	const m = Math.round((v - h) * 60)
	return `${h}:${String(m).padStart(2, '0')}`
}

// 'local' uses Date.getHours(), which already reads in the browser's own timezone — 'ny' pins
// the hour-of-day to America/New_York regardless of where the trader is, since that's the
// standard reference clock for US market sessions.
function hourOfDay(iso: string, zone: TimeZoneMode): number {
	const d = new Date(iso)
	if (zone === 'local') return d.getHours() + d.getMinutes() / 60
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
	}).formatToParts(d)
	const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
	const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
	return hour + minute / 60
}

export function TradeTimeScatter({ trades }: { trades: Trade[] }) {
	const { whole: money } = useMoney()
	const [zone, setZone] = useState<TimeZoneMode>('local')
	const point = (t: Trade) => ({
		hour: hourOfDay(t.entryTime, zone),
		pnl: t.pnl,
		symbol: t.symbol,
	})
	const wins = trades.filter((t) => t.pnl >= 0).map(point)
	const losses = trades.filter((t) => t.pnl < 0).map(point)

	return (
		<DashboardCard className="md:col-span-2">
			<CardHeader>
				<CardTitle>Trade time performance</CardTitle>
				<CardDescription>
					Every trade by entry hour. {wins.length} up, {losses.length} down.
				</CardDescription>
				<CardAction className="flex gap-1">
					{(['local', 'ny'] as const).map((z) => (
						<Button
							aria-pressed={zone === z}
							key={z}
							onClick={() => setZone(z)}
							size="xs"
							variant={zone === z ? 'secondary' : 'ghost'}
						>
							{z === 'local' ? 'Local' : 'NY (EST)'}
						</Button>
					))}
				</CardAction>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-80 w-full" config={chartConfig}>
					<ScatterChart margin={{ left: 4, right: 8, top: 4 }}>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis
							axisLine={false}
							dataKey="hour"
							domain={[0, 24]}
							name="Entry time"
							tickFormatter={(v) => (v % 2 === 0 ? `${v}:00` : '')}
							tickLine={false}
							ticks={HOUR_TICKS}
							type="number"
						/>
						<YAxis
							axisLine={false}
							dataKey="pnl"
							name="P&L"
							tickFormatter={(v) => money(Number(v))}
							tickLine={false}
							type="number"
							width={56}
						/>
						<ZAxis range={[40, 40]} />
						<ChartTooltip
							cursor={{ strokeDasharray: '3 3' }}
							content={
								<ChartTooltipContent
									// The symbol identifies the point; hour and P&L are the rows.
									labelFormatter={(_v, payload) =>
										String(payload?.[0]?.payload?.symbol ?? 'Trade')
									}
									formatter={(value, name, item) => (
										<ChartTooltipRow
											color={name === 'P&L' ? item?.payload?.fill : undefined}
											label={name}
											value={
												name === 'P&L'
													? money(Number(value))
													: formatHourLabel(Number(value))
											}
										/>
									)}
								/>
							}
						/>
						<Scatter
							data={wins}
							fill="var(--color-win)"
							isAnimationActive={false}
						/>
						<Scatter
							data={losses}
							fill="var(--color-loss)"
							isAnimationActive={false}
						/>
					</ScatterChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	)
}
