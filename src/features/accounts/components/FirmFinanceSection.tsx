import { PieChart, Pie, Cell } from 'recharts'
import type { Account, Payout, SessionLog, Trade } from '../../../db/schema'
import { pnlOnDay, type AccountLedger } from '../../../utils/ledger'
import { firmFinanceBreakdown, firmPassRate, pathToFundingProgress, breachReasonCounts } from '../../../utils/firmFinance'
import { PROP_FIRMS } from '../propFirms'
import { Meter } from '../../../shared/ui/Meter'
import { todayISO } from '../../../db/sessions'
import { CATEGORICAL_COLORS } from '../../../utils/chartTheme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import styles from './FirmFinanceSection.module.css'

/* Converted onto shadcn Card, and the donut off bare Recharts onto the same
 * ChartContainer the dashboard uses — this was the last chart in the app still
 * drawing its own tooltip from chartTheme.ts. */

function firmName(firmId: string): string {
  return PROP_FIRMS.find((f) => f.id === firmId)?.name ?? firmId
}

function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`
}

/** The donut has one slice per firm, so its config is built at render time
 * rather than declared — ChartContainer needs it for the tooltip labels. */
function donutConfig(names: string[]): ChartConfig {
  return Object.fromEntries(
    names.map((name, i) => [
      name,
      { label: name, color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] },
    ]),
  )
}

export function FirmFinanceSection({
  accounts,
  payouts,
  trades,
  sessionsByAccountId,
  ledgers,
}: {
  accounts: Account[]
  payouts: Payout[]
  trades: Trade[]
  sessionsByAccountId: Map<string, SessionLog[]>
  ledgers: Map<string, AccountLedger>
}) {
  const payoutsByAccountId = new Map<string, Payout[]>()
  for (const p of payouts) {
    const list = payoutsByAccountId.get(p.accountId) ?? []
    list.push(p)
    payoutsByAccountId.set(p.accountId, list)
  }

  const finance = firmFinanceBreakdown(accounts, payoutsByAccountId)
  const passRates = firmPassRate(accounts)
  const breaches = breachReasonCounts(accounts)
  const today = todayISO()

  const evalAccounts = accounts
    .filter((a) => a.active)
    .map((a) => ({
      account: a,
      progress: pathToFundingProgress(
        a,
        a.id ? ledgers.get(a.id) : undefined,
        pnlOnDay(trades.filter((t) => t.accountId === a.id), sessionsByAccountId.get(a.id!) ?? [], today),
      ),
    }))
    .filter((x): x is { account: Account; progress: NonNullable<ReturnType<typeof pathToFundingProgress>> } => x.progress !== null)

  if (finance.length === 0) return null

  const netTotal = finance.reduce((sum, f) => sum + f.net, 0)
  const hasFinanceData = finance.some((f) => f.spent > 0 || f.earned > 0)
  const names = finance.map((f) => firmName(f.firmId))

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading font-semibold text-sm uppercase tracking-wide">
        Firm finance
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spent vs earned by firm</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className={styles.donutWrap}>
              <ChartContainer className="size-full" config={donutConfig(names)}>
                <PieChart>
                  <Pie
                    data={
                      hasFinanceData
                        ? finance.map((f, i) => ({ name: names[i], value: f.earned }))
                        : [{ name: 'No data', value: 1 }]
                    }
                    dataKey="value"
                    innerRadius={44}
                    isAnimationActive={false}
                    nameKey="name"
                    outerRadius={64}
                    paddingAngle={hasFinanceData ? 2 : 0}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {hasFinanceData
                      ? finance.map((f, i) => (
                          <Cell fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} key={f.firmId} />
                        ))
                      : [<Cell fill="var(--muted)" key="none" />]}
                  </Pie>
                  {hasFinanceData && (
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <span className="flex w-full justify-between gap-3">
                              <span className="text-muted-foreground">{name}</span>
                              <span className="font-medium tabular-nums">
                                {money(Number(value))}
                              </span>
                            </span>
                          )}
                          hideLabel
                        />
                      }
                    />
                  )}
                </PieChart>
              </ChartContainer>
              {/* Centred over the donut hole. Pointer-events off so it can never
                  swallow a hover meant for a slice behind it. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-muted-foreground text-[0.7rem]">Net</div>
                <div
                  className="font-semibold text-sm tabular-nums"
                  style={{ color: netTotal >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
                >
                  {netTotal >= 0 ? '+' : '-'}${Math.abs(netTotal).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {finance.map((f, i) => (
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b py-1.5 text-xs last:border-b-0"
                  key={f.firmId}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{firmName(f.firmId)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    -${f.spent.toLocaleString()} · +${f.earned.toLocaleString()}
                  </span>
                  <span
                    className="w-16 text-right font-semibold tabular-nums"
                    style={{ color: f.net >= 0 ? 'var(--good-deep)' : 'var(--critical-deep)' }}
                  >
                    {f.net >= 0 ? '+' : '-'}${Math.abs(f.net).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pass rate by firm</CardTitle>
          </CardHeader>
          <CardContent>
            {passRates.map((p) => (
              <Meter
                key={p.firmId}
                label={firmName(p.firmId)}
                mode="performance"
                pct={p.pct}
                rightLabel={`${p.passed}/${p.total} · ${Math.round(p.pct * 100)}%`}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {evalAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Path to funding</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {evalAccounts.map(({ account, progress }) => (
              <div className="rounded-lg border p-3" key={account.id}>
                <div className="mb-2 truncate font-medium text-sm">{account.label}</div>
                <Meter label="Profit" mode="progress" pct={progress.profitPct} rightLabel={`${Math.round(progress.profitPct * 100)}%`} />
                {progress.daysPct !== null && (
                  <Meter label="Days" mode="progress" pct={progress.daysPct} rightLabel={`${Math.round(progress.daysPct * 100)}%`} />
                )}
                {progress.dailyLossPct !== null && (
                  <Meter label="Daily loss used" mode="risk" pct={progress.dailyLossPct} rightLabel={`${Math.round(progress.dailyLossPct * 100)}%`} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {breaches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top breach reasons</CardTitle>
          </CardHeader>
          <CardContent>
            {breaches.map((b) => (
              <Meter key={b.reason} label={b.reason} mode="risk" pct={b.count / breaches[0].count} rightLabel={String(b.count)} />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
