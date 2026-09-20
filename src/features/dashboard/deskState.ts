/* What an empty dashboard should say.
 *
 * "Your desk is empty" used to be one screen: three onboarding steps, shown
 * whenever there were no trades. That is right for a new user and wrong for
 * this one -- someone with seven connected MT5 accounts was being told to add
 * an account, because the dashboard reads `trades` and knows nothing about
 * `trading_accounts`.
 *
 * The distinction that matters is where the history actually is. A connected
 * account's trade history lives in MT5's terminal, not in Postgres: the copier
 * tables carry balance, equity and connection state, which is a reading taken
 * now, with no past in it. Every tile on the dashboard -- the equity curve,
 * win rate, profit factor, the calendar -- is built from `trades` rows with an
 * entry, an exit and a P&L. Journalling is what moves that history across. It
 * is not a permission gate; it is the transfer itself.
 */

export type DeskState =
  /** Accounts are connected, but none of them journals into the dashboard, so
   * no history is being transferred and none ever will be until one does. */
  | { kind: 'connected-unjournalled'; connected: number }
  /** Journalling is on and the worker has not written anything yet -- either it
   * is not running, or it has not reached its first history read. */
  | { kind: 'awaiting-history'; journalled: number }
  /** Nothing connected. The genuine new-user case the three steps were for. */
  | { kind: 'onboarding'; hasAccounts: boolean }

export function deskState(input: {
  hasAccounts: boolean
  connectedAccounts: number
  journalledAccounts: number
}): DeskState {
  // Journalling set up at all wins, even partially: the link exists, so trades
  // are on their way and telling the user to go set it up would be wrong.
  if (input.journalledAccounts > 0) {
    return { kind: 'awaiting-history', journalled: input.journalledAccounts }
  }
  if (input.connectedAccounts > 0) {
    return { kind: 'connected-unjournalled', connected: input.connectedAccounts }
  }
  return { kind: 'onboarding', hasAccounts: input.hasAccounts }
}

/** Plain-language account count, so the copy reads as a sentence. */
export function accountCount(n: number): string {
  return `${n} connected account${n === 1 ? '' : 's'}`
}
