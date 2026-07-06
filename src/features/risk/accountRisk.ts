import type { Account } from '../../db/schema'
import { riskPerTrade, dailyStop, maxTradesPerDay } from './risk'

export function computeAccountRisk(account: Account) {
  const maxDd = account.maxDrawdown ?? (account.size * 0.10)
  const dailyLoss = account.dailyLossLimit ?? 0
  const isTrailing = account.trailingDrawdown ?? false

  // Drawdown room calculation:
  // - Trailing: liquidation threshold is highestBalance - maxDrawdown
  // - Static: liquidation threshold is size - maxDrawdown
  const threshold = isTrailing
    ? account.highestBalance - maxDd
    : account.size - maxDd
  const room = Math.max(0, account.balance - threshold)

  const risk = riskPerTrade(maxDd)
  const stop = dailyLoss > 0 ? dailyStop(dailyLoss, maxDd) : dailyStop(null, maxDd)
  const trades = maxTradesPerDay(stop, risk)

  let cushion = null
  if (account.profitTarget) {
    const targetBalance = account.size + account.profitTarget
    const remaining = Math.max(0, targetBalance - account.balance)
    cushion = { label: 'to profit target', amount: remaining }
  }

  return { maxDd, room, risk, stop, trades, cushion }
}
