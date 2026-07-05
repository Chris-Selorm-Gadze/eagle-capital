import type { Account } from '../db/schema'
import { roomToTrail, profitToTarget, profitToPayoutMin, APEX_250K } from '../domain/apex'
import { ddLimits, type FnModel } from '../domain/fundednext'
import { riskPerTrade, dailyStop, maxTradesPerDay } from '../domain/risk'

export function computeAccountRisk(account: Account) {
  const isApex = account.firm === 'apex'
  const maxDd = isApex ? APEX_250K.trailingDD : ddLimits(account.model as FnModel, account.size).maxLoss
  const firmDailyLimit = isApex ? null : ddLimits(account.model as FnModel, account.size).dailyLoss
  const room = isApex
    ? roomToTrail(account.balance, account.highestBalance, account.stage === 'pa' ? 'pa' : 'evaluation', account.platform)
    : account.balance - (account.size - maxDd)
  const risk = riskPerTrade(maxDd)
  const stop = dailyStop(firmDailyLimit, maxDd)
  const trades = maxTradesPerDay(stop, risk)
  const cushion = isApex
    ? account.stage === 'pa'
      ? { label: 'to payout minimum', amount: profitToPayoutMin(account.balance) }
      : { label: 'to eval target', amount: profitToTarget(account.balance) }
    : null

  return { isApex, maxDd, firmDailyLimit, room, risk, stop, trades, cushion }
}
