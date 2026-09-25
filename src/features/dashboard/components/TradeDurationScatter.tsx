import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ZAxis } from 'recharts'
import {
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
import { DashboardCard } from '@/components/dashboard-card'
import type { Trade } from '@/db/schema'
import { tradeDurationMinutes } from '@/utils/tradeStats'
import { formatDuration } from '@/utils/format'
import { ChartTooltipRow } from './ChartTooltipRow'
import { useMoney } from '@/components/money-context'

/* Converted off bare Recharts + `.card` onto the shared ChartContainer — same
 * change as its sibling scatter, for the same reason. */

const chartConfig = {
	win: { label: 'Win', color: 'var(--good)' },
	loss: { label: 'Loss', color: 'var(--critical)' },
} satisfies ChartConfig

export function TradeDurationScatter({ trades }: { trades: Trade[] }) {
	const { whole: money } = useMoney()
	const points = (list: Trade[]) =>
		list.map((t) => ({
			duration: tradeDurationMinutes(t.entryTime, t.exitTime),
			pnl: t.pnl,
			symbol: t.symbol,
		}))
	const wins = points(trades.filter((t) => t.pnl >= 0))
	const losses = points(trades.filter((t) => t.pnl < 0))

	return (
		<DashboardCard className="md:col-span-2">
			<CardHeader>
				<CardTitle>Trade duration performance</CardTitle>
				<CardDescription>
					P&amp;L against how long each trade was held.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-80 w-full" config={chartConfig}>
					<ScatterChart margin={{ left: 4, right: 8, top: 4 }}>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis
							axisLine={false}
							dataKey="duration"
							name="Held for"
							tickFormatter={(v) => formatDuration(Number(v))}
							tickLine={false}
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
													: formatDuration(Number(value))
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
