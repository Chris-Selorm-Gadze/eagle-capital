import {
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Delta, DeltaIcon, DeltaValue } from '@/components/delta'
import { DashboardCard } from '@/components/dashboard-card'
import type { Trade } from '@/db/schema'
import { netPnl, winRate, profitFactor } from '@/utils/tradeStats'

/* KPI row built on the dashboard block's card + delta primitives, fed by the
 * app's own aggregate helpers rather than the block's demo constants.
 *
 * The delta compares the most recent half of the trade history against the
 * half before it — a self-scaling "recent vs earlier" that works whether the
 * account has 20 trades or 2,000, without inventing a fixed window. */

function percentChange(current: number, previous: number): number {
	if (previous === 0) return current === 0 ? 0 : 100
	return ((current - previous) / Math.abs(previous)) * 100
}

export function StatsRow({ trades }: { trades: Trade[] }) {
	const ordered = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))
	const mid = Math.floor(ordered.length / 2)
	const earlier = ordered.slice(0, mid)
	const recent = ordered.slice(mid)
	const hasSplit = earlier.length > 0 && recent.length > 0

	const stats = [
		{
			label: 'Net P&L',
			value: `${netPnl(trades) < 0 ? '-' : ''}$${Math.abs(netPnl(trades)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
			delta: hasSplit ? percentChange(netPnl(recent), netPnl(earlier)) : null,
		},
		{
			label: 'Win rate',
			// winRate() returns a 0–1 ratio, so scale to a percentage here. The
			// delta is in percentage points, not a relative change.
			value: `${(winRate(trades) * 100).toFixed(1)}%`,
			delta: hasSplit ? (winRate(recent) - winRate(earlier)) * 100 : null,
		},
		{
			label: 'Profit factor',
			value: Number.isFinite(profitFactor(trades)) ? profitFactor(trades).toFixed(2) : '—',
			delta: hasSplit ? percentChange(profitFactor(recent), profitFactor(earlier)) : null,
		},
		{
			label: 'Trades',
			value: trades.length.toLocaleString(),
			delta: hasSplit ? percentChange(recent.length, earlier.length) : null,
		},
	]

	return (
		<>
			{stats.map((s) => (
				<DashboardCard key={s.label}>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="font-normal text-muted-foreground text-xs tracking-wide">
							{s.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row items-center gap-2">
						<p className="font-semibold text-2xl tabular-nums">{s.value}</p>
					</CardContent>
					<CardFooter className="gap-1 rounded-none bg-background text-xs">
						{s.delta === null || !Number.isFinite(s.delta) ? (
							<span className="text-muted-foreground">Not enough history</span>
						) : (
							<>
								<Delta value={Number(s.delta.toFixed(1))}>
									<DeltaIcon />
									<DeltaValue />
								</Delta>
								<span className="text-muted-foreground">vs earlier trades</span>
							</>
						)}
					</CardFooter>
				</DashboardCard>
			))}
		</>
	)
}
