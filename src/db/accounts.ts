import { supabase } from '../lib/supabaseClient'
import type { Account } from '../types'

export type NewAccountInput = Omit<Account, 'id' | 'balance' | 'highestBalance'> &
  Partial<Pick<Account, 'balance' | 'highestBalance'>>

export function fromRow(row: Record<string, any>): Account {
  return {
    id: row.id,
    firmId: row.firm_id,
    customFirmName: row.custom_firm_name ?? undefined,
    label: row.label,
    accountNumber: row.account_number ?? undefined,
    size: Number(row.size),
    balance: Number(row.balance),
    highestBalance: Number(row.highest_balance),
    currency: row.currency ?? undefined,
    stage: row.stage,
    maxDrawdown: row.max_drawdown !== null ? Number(row.max_drawdown) : undefined,
    dailyLossLimit: row.daily_loss_limit !== null ? Number(row.daily_loss_limit) : undefined,
    profitTarget: row.profit_target !== null ? Number(row.profit_target) : undefined,
    trailingDrawdown: row.trailing_drawdown ?? undefined,
    minTradingDays: row.min_trading_days ?? undefined,
    fundedDate: row.funded_date ?? undefined,
    active: row.active,
    notes: row.notes ?? undefined,
    cost: row.cost !== null ? Number(row.cost) : undefined,
    blownReason: row.blown_reason ?? undefined,
    payoutsDone: row.payouts_done ?? undefined,
    cumulativePaid: row.cumulative_paid !== null ? Number(row.cumulative_paid) : undefined,
  }
}

export function toRow(a: Partial<Account>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (a.firmId !== undefined) row.firm_id = a.firmId
  if (a.customFirmName !== undefined) row.custom_firm_name = a.customFirmName
  if (a.label !== undefined) row.label = a.label
  if (a.accountNumber !== undefined) row.account_number = a.accountNumber
  if (a.size !== undefined) row.size = a.size
  if (a.balance !== undefined) row.balance = a.balance
  if (a.highestBalance !== undefined) row.highest_balance = a.highestBalance
  if (a.currency !== undefined) row.currency = a.currency
  if (a.stage !== undefined) row.stage = a.stage
  if (a.maxDrawdown !== undefined) row.max_drawdown = a.maxDrawdown
  if (a.dailyLossLimit !== undefined) row.daily_loss_limit = a.dailyLossLimit
  if (a.profitTarget !== undefined) row.profit_target = a.profitTarget
  if (a.trailingDrawdown !== undefined) row.trailing_drawdown = a.trailingDrawdown
  if (a.minTradingDays !== undefined) row.min_trading_days = a.minTradingDays
  if (a.fundedDate !== undefined) row.funded_date = a.fundedDate
  if (a.active !== undefined) row.active = a.active
  if (a.notes !== undefined) row.notes = a.notes
  if (a.cost !== undefined) row.cost = a.cost
  if (a.blownReason !== undefined) row.blown_reason = a.blownReason
  if (a.payoutsDone !== undefined) row.payouts_done = a.payoutsDone
  if (a.cumulativePaid !== undefined) row.cumulative_paid = a.cumulativePaid
  return row
}

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from('accounts').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function addAccount(userId: string, input: NewAccountInput): Promise<string> {
  const balance = input.balance ?? input.size
  const highestBalance = input.highestBalance ?? balance

  const account: Account = {
    ...input,
    balance,
    highestBalance,
    payoutsDone: input.payoutsDone ?? 0,
    cumulativePaid: input.cumulativePaid ?? 0,
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({ user_id: userId, ...toRow(account) })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateAccount(id: string, patch: Partial<Account>): Promise<void> {
  const { error } = await supabase.from('accounts').update(toRow(patch)).eq('id', id)
  if (error) throw error
}

export async function setAccountActive(id: string, active: boolean): Promise<void> {
  await updateAccount(id, { active })
}
