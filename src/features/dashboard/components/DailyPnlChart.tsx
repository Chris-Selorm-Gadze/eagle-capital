import { Bar, BarChart, Cell, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { formatDate } from '@/components/formater'
import type { DailyPnl } from '@/utils/tradeAggregates'

const chartConfig = {
	pnl: { label: 'Daily P&L', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Green up / red down per bar — colour carries the sign, so no legend needed. */
export function DailyPnlChart({ daily }: { daily: DailyPnl[] }) {
	const greenDays = daily.filter((d) => d.pnl > 0).length
	const redDays = daily.filter((d) => d.pnl < 0).length

	return (
		<DashboardCard className="md:col-span-2">
			<CardHeader>
				<CardTitle>Daily P&amp;L</CardTitle>
				<CardDescription>
					{daily.length > 0
						? `${greenDays} green · ${redDays} red`
						: 'No trades logged yet'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-56 w-full" config={chartConfig}>
					<BarChart data={daily} margin={{ left: 4, right: 4, top: 4 }}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="date"
							minTickGap={28}
							tickFormatter={(v) => formatDate(String(v), 'day-month')}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
							tickLine={false}
							width={62}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(v) => formatDate(String(v), 'full')}
								/>
							}
						/>
						<Bar dataKey="pnl" radius={2}>
							{daily.map((d) => (
								<Cell
									fill={d.pnl >= 0 ? 'var(--good)' : 'var(--critical)'}
									key={d.date}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	)
}
