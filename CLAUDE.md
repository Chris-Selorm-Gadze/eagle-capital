# CLAUDE.md — EagleCapital (prop-tracker)

Personal dashboard tracking prop-firm accounts: FundedNext CFD (Stellar) + Apex Trader Funding (4× 250K LEGACY futures). Owner: Chris. Build milestones live in PLAN.md — always check which milestone is next before adding features.

## Commands
- `npm run dev` — Vite dev server
- `npm test` — Vitest (domain rules). Must be green before and after every change.
- `npm run build` — typecheck + production build

## Architecture
- `src/domain/` — ALL prop-firm rules and risk math. Pure functions, no I/O. Each constant has a source URL comment and a "verified <date>". **Never duplicate rule numbers in UI code — import from domain.**
- `src/db/` — Dexie (IndexedDB) schema + seed. Tables: accounts, sessions, payouts.
- `src/App.tsx` — UI. Plain React, no state library; `useLiveQuery` from dexie-react-hooks reads the DB reactively.

## Invariants
1. Any change to a rule constant or rule function REQUIRES updating/adding a test in `src/domain/__tests__/` and the source comment.
2. Apex `highestBalance` includes UNREALIZED peaks — the trailing threshold trails the highest live value, not closed balances. Never compute trail from closed P&L only.
3. Apex 250K legacy: trail $6,500; Rithmic eval trail caps at $265,000 threshold; PA caps at $250,100; Tradovate eval never caps. PA accounts have NO resets.
4. FundedNext: base allocation cap $300K is on UNSCALED sizes only; Pro scale events (+25%) don't count against it.
5. Risk framework (self-imposed, stricter than firm rules): risk/trade = 10% of drawdown; daily stop = 50% of firm daily limit, or 30% of trail for Apex. The UI should always surface these before firm limits.
6. Money formatting: whole dollars, `toLocaleString()`. Dates: ISO strings in DB.

## Domain gotchas
- Apex 30% windfall rule applies until the 6th payout: biggestDay / 0.3 = min total profit to request.
- Apex payout split: 100% of first $25K per account (track `cumulativePaid`), then 90%.
- FundedNext Pro needs BOTH 61 days age AND 4 qualifying (≥4% growth) cycles — see `proEligible()`.
- A "done-for-day" circuit breaker on one Apex account applies to all four (trade copier).

## Rule sources (re-verify if behavior seems off — firms change rules)
- https://apextraderfunding.com/help-center/evaluation-accounts-ea/legacy-evaluation-rules/
- https://apextraderfunding.com/help-center/legacy-payouts/legacy-pa-payout-parameters/
- https://help.fundednext.com/en/articles/13349186-fundednext-pro-the-scale-up-program
- https://help.fundednext.com/en/articles/8019659-does-fundednext-offer-a-scale-up-plan
