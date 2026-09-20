import { describe, expect, it } from 'vitest'
import { accountCount, deskState } from './deskState'

describe('deskState', () => {
  it('shows onboarding to someone with nothing', () => {
    expect(deskState({ hasAccounts: false, connectedAccounts: 0, journalledAccounts: 0 }))
      .toEqual({ kind: 'onboarding', hasAccounts: false })
  })

  it('does not tell someone with connected accounts to add an account', () => {
    // The bug this file exists for: seven live MT5 connections, and the
    // dashboard opened on "Step 1 — Add an account".
    const state = deskState({ hasAccounts: false, connectedAccounts: 7, journalledAccounts: 0 })
    expect(state.kind).toBe('connected-unjournalled')
  })

  it('counts the accounts so the fix can name them', () => {
    const state = deskState({ hasAccounts: false, connectedAccounts: 7, journalledAccounts: 0 })
    expect(state).toEqual({ kind: 'connected-unjournalled', connected: 7 })
  })

  it('stops asking once any account journals', () => {
    // Partial counts as set up. The link exists, so trades are on their way and
    // sending the user back to configure it would be wrong.
    expect(deskState({ hasAccounts: true, connectedAccounts: 7, journalledAccounts: 1 }))
      .toEqual({ kind: 'awaiting-history', journalled: 1 })
  })

  it('still onboards a user whose only accounts are typed in by hand', () => {
    // Manual accounts with no trades: the original empty desk, step one done.
    expect(deskState({ hasAccounts: true, connectedAccounts: 0, journalledAccounts: 0 }))
      .toEqual({ kind: 'onboarding', hasAccounts: true })
  })
})

describe('accountCount', () => {
  it('reads as a sentence at one and at many', () => {
    expect(accountCount(1)).toBe('1 connected account')
    expect(accountCount(7)).toBe('7 connected accounts')
  })
})
