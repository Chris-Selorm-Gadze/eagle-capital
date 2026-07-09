# CLAUDE.md — EagleCapital (prop-tracker)

Personal dashboard tracking prop-firm accounts across any prop firm — no firm's rules or risk math are hardcoded into the app. Owner: Chris. Build milestones live in PLAN.md — always check which milestone is next before adding features.

Note: the automatic rule-math domain layer (trailing-drawdown calc, circuit breakers, payout gate checks, scaling eligibility) that used to live in `src/domain/` and `src/features/risk/` has been removed — Chris is building a different approach to prop-firm risk management elsewhere. Payouts, rewards, and funded-date tracking are plain manual entry (no computed gates/eligibility). Account risk fields have no auto-filled defaults either — every firm has its own rules, so the user types their own numbers.

## Commands
- `npm run dev` — Vite dev server
- `npm test` — Vitest
- `npm run build` — typecheck + production build

## Architecture
- `src/db/` — per-user Supabase (Postgres) tables via `@supabase/supabase-js`. Tables: accounts, sessions, payouts, rewards, trades, report_cards, broker_connections. RLS scoped to `auth.uid()`. No local storage — data fetched on sign-in via `useSupabaseData`, refetched after writes (no live-query reactivity).
- `src/App.tsx` — UI. Plain React, no state library.
- `src/features/accounts/propFirms.ts` — the prop-firm catalog (`PROP_FIRMS`) is just labels/metadata for the account form's dropdown, not rule logic — adding a firm there doesn't encode any of its actual rules.

## Conventions
- Money formatting: whole dollars, `toLocaleString()`. Dates: ISO strings in DB.
- `Account.maxDrawdown`/`dailyLossLimit`/`trailingDrawdown`/`profitTarget`/`minTradingDays` are plain user-entered fields on the account — no rule logic currently derives, enforces, or auto-fills them.
