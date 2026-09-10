import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Account, Payout, SessionLog } from '../../../db/schema'
import { firmFinanceBreakdown, firmPassRate, pathToFundingProgress, breachReasonCounts } from '../../../utils/firmFinance'
import { PROP_FIRMS } from '../propFirms'
import { Meter } from '../../../shared/ui/Meter'
import { todayISO } from '../../../db/sessions'
import { CATEGORICAL_COLORS, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE } from '../../../utils/chartTheme'
import styles from './FirmFinanceSection.module.css'

function firmName(firmId: string): string {
  return PROP_FIRMS.find((f) => f.id === firmId)?.name ?? firmId
}

export function FirmFinanceSection({
  accounts,
  payouts,
  sessionsByAccountId,
}: {
  accounts: Account[]
  payouts: Payout[]
  sessionsByAccountId: Map<string, SessionLog[]>
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
    .map((a) => ({ account: a, progress: pathToFundingProgress(a, sessionsByAccountId.get(a.id!) ?? [], today) }))
    .filter((x): x is { account: Account; progress: NonNullable<ReturnType<typeof pathToFundingProgress>> } => x.progress !== null)

  if (finance.length === 0) return null

  const netTotal = finance.reduce((sum, f) => sum + f.net, 0)
  const hasFinanceData = finance.some((f) => f.spent > 0 || f.earned > 0)

  return (
    <section className={styles.section}>
      <h2>Firm Finance</h2>
      <div className={styles.row}>
        <div className="card">
          <div className={styles.cardTitle}>Spent vs earned by firm</div>
          <div className={styles.donutRow}>
            <div className={styles.donutWrap}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      hasFinanceData
                        ? finance.map((f) => ({ name: firmName(f.firmId), value: f.earned }))
                        : [{ name: 'No data', value: 1 }]
                    }
                    dataKey="value" nameKey="name" innerRadius={44} outerRadius={64}
                    paddingAngle={hasFinanceData ? 2 : 0} stroke="var(--surface)" strokeWidth={2}
                  >
                    {hasFinanceData
                      ? finance.map((f, i) => <Cell key={f.firmId} fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />)
                      : [<Cell key="none" fill="var(--surface-2)" />]}
                  </Pie>
                  {hasFinanceData && (
                    <Tooltip
                      formatter={(value) => `$${Number(value).toLocaleString()}`}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                    />
                  )}
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutCenter}>
                <div className={styles.donutCenterLabel}>Net</div>
                <div className={styles.donutCenterValue} style={{ color: netTotal >= 0 ? 'var(--good)' : 'var(--critical)' }}>
                  {netTotal >= 0 ? '+' : '-'}${Math.abs(netTotal).toLocaleString()}
                </div>
              </div>
            </div>
            <div className={styles.legend}>
              {finance.map((f, i) => (
                <div key={f.firmId} className={styles.legendRow}>
                  <span className={styles.dot} style={{ background: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }} />
                  <span className={styles.legendName}>{firmName(f.firmId)}</span>
                  <span className={styles.legendNums}>
                    -${f.spent.toLocaleString()} · +${f.earned.toLocaleString()}
                  </span>
                  <span style={{ color: f.net >= 0 ? 'var(--good)' : 'var(--critical)', fontWeight: 600 }}>
                    {f.net >= 0 ? '+' : '-'}${Math.abs(f.net).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className={styles.cardTitle}>Pass rate by firm</div>
          {passRates.map((p) => (
            <Meter
              key={p.firmId}
              label={firmName(p.firmId)}
              pct={p.pct}
              mode="performance"
              rightLabel={`${p.passed}/${p.total} · ${Math.round(p.pct * 100)}%`}
            />
          ))}
        </div>
      </div>

      {evalAccounts.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className={styles.cardTitle}>Path to funding</div>
          <div className={styles.pathGrid}>
            {evalAccounts.map(({ account, progress }) => (
              <div key={account.id} className={styles.pathCard}>
                <div className={styles.pathCardTitle}>{account.label}</div>
                <Meter label="Profit" pct={progress.profitPct} mode="progress" rightLabel={`${Math.round(progress.profitPct * 100)}%`} />
                {progress.daysPct !== null && (
                  <Meter label="Days" pct={progress.daysPct} mode="progress" rightLabel={`${Math.round(progress.daysPct * 100)}%`} />
                )}
                {progress.dailyLossPct !== null && (
                  <Meter label="Daily loss used" pct={progress.dailyLossPct} mode="risk" rightLabel={`${Math.round(progress.dailyLossPct * 100)}%`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {breaches.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className={styles.cardTitle}>Top breach reasons</div>
          {breaches.map((b) => (
            <Meter key={b.reason} label={b.reason} pct={b.count / breaches[0].count} mode="risk" rightLabel={String(b.count)} />
          ))}
        </div>
      )}
    </section>
  )
}
