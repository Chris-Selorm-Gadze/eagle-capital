import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { cumulativeSeries, type DailyPnl } from '@/utils/tradeAggregates'

const chartConfig = {
	cumulative: { label: 'Cumulative P&L', color: 'var(--accent)' },
} satisfies ChartConfig

export function EquityChart({ daily }: { daily: DailyPnl[] }) {
	const data = cumulativeSeries(daily)
	const last = data.at(-1)?.cumulative ?? 0

	return (
		<DashboardCard className="md:col-span-2">
			<CardHeader>
				<CardTitle>Cumulative P&amp;L</CardTitle>
				<CardDescription>
					{data.length > 0
						? `${data.length} trading day${data.length === 1 ? '' : 's'} · ${last < 0 ? '-' : ''}$${Math.abs(last).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
						: 'No trades logged yet'}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-56 w-full" config={chartConfig}>
					<AreaChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
						<defs>
							<linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="var(--color-cumulative)" stopOpacity={0.28} />
								<stop offset="100%" stopColor="var(--color-cumulative)" stopOpacity={0} />
							</linearGradient>
						</defs>
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
						<Area
							dataKey="cumulative"
							fill="url(#equityFill)"
							stroke="var(--color-cumulative)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	)
}
