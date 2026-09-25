import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
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
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from '@/components/ui/chart'
import { DashboardCard } from '@/components/dashboard-card'
import { formatDate } from '@/components/formater'
import type { LedgerPoint } from '@/utils/ledger'
import { ChartTooltipRow } from './ChartTooltipRow'
import { useMoney } from '@/components/money-context'

/* Converted off bare Recharts onto the same ChartContainer the equity and daily
 * P&L charts use.
 *
 * It previously rendered inside `.card` (theme.css) with its own
 * `ResponsiveContainer`, its own `<Tooltip>` styled from chartTheme.ts, and a
 * hand-built legend of coloured dots — sitting one flex row below two charts
 * using the shadcn card, the shadcn tooltip and no legend at all. Same screen,
 * two designs.
 *
 * Nothing about the data changed: the line is still drawn from utils/ledger.ts,
 * and the figure in the corner is still the same ledger summed over whatever the
 * account filter selects, so the number and the end of the curve agree. */

const chartConfig = {
	balance: { label: 'Account balance', color: 'var(--chart-1)' },
	withdrawals: { label: 'Deposits / withdrawals', color: 'var(--chart-5)' },
} satisfies ChartConfig

export function AccountBalanceChart({
	data,
	currentBalance,
}: {
	data: LedgerPoint[]
	currentBalance: number
}) {
	const { whole: money } = useMoney()
	return (
		<DashboardCard className="md:col-span-2">
			<CardHeader>
				<CardTitle>Account balance</CardTitle>
				<CardDescription>
					Starting allocation plus everything logged, less what's been withdrawn.
				</CardDescription>
				{/* Was an `.info-icon` with a CSS-only `data-tooltip`, which existed
				    because the legacy pages had no tooltip primitive. The explanation is
				    short enough to simply say, so it's the card description now — no
				    hover required, and it reads on a touch screen. */}
				<CardAction className="font-semibold text-lg tabular-nums">
					{money(currentBalance)}
				</CardAction>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-56 w-full" config={chartConfig}>
					<LineChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
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
							tickFormatter={(v) => money(Number(v))}
							tickLine={false}
							width={62}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									formatter={(value, name, item) => (
										<ChartTooltipRow
											color={item?.color}
											label={
												chartConfig[name as keyof typeof chartConfig]?.label ?? name
											}
											value={money(Number(value))}
										/>
									)}
									labelFormatter={(v) => formatDate(String(v), 'full')}
								/>
							}
						/>
						{/* Replaces the hand-built dot legend. Two series on one axis need
						    one, and this is the same legend every other chart would get. */}
						<ChartLegend content={<ChartLegendContent />} />
						<Line
							dataKey="balance"
							dot={false}
							isAnimationActive={false}
							stroke="var(--color-balance)"
							strokeWidth={2}
							type="monotone"
						/>
						<Line
							dataKey="withdrawals"
							dot={false}
							isAnimationActive={false}
							stroke="var(--color-withdrawals)"
							strokeWidth={2}
							type="monotone"
						/>
					</LineChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	)
}
