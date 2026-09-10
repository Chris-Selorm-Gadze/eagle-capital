# CLAUDE.md — EagleCapital (prop-tracker)

Trading operations suite for multi-account traders — prop-firm and live broker accounts, journal, trade copier, pattern detection. No firm's rules or risk math are hardcoded into the app. Owner: Chris.

Note: PLAN.md was deleted and is **not** a roadmap — its milestones describe a replaced (Dexie/`src/domain/`) architecture and its stated non-goals ("no auth, cloud sync, order execution") have all since been built. There is no current roadmap document; `README.md` is the accurate description of what exists.

Note: the automatic rule-math domain layer (trailing-drawdown calc, circuit breakers, payout gate checks, scaling eligibility) that used to live in `src/domain/` and `src/features/risk/` has been removed — Chris is building a different approach to prop-firm risk management elsewhere. Payouts, rewards, and funded-date tracking are plain manual entry (no computed gates/eligibility). Account risk fields have no auto-filled defaults either — every firm has its own rules, so the user types their own numbers.

## Commands
- `npm run dev` — Vite dev server
- `npm test` — Vitest
- `npm run build` — typecheck + production build

## Architecture
- `src/db/` — per-user Supabase (Postgres) tables via `@supabase/supabase-js`. Tables: accounts, sessions, payouts, rewards, trades, report_cards, broker_connections. RLS scoped to `auth.uid()`. No local storage — data fetched on sign-in via `useSupabaseData`, refetched after writes (no live-query reactivity).
- `src/AuthGate.tsx` — top-level router. Three surfaces share one origin: the public marketing site (`/`, `/features`, `/pricing`, …), auth (`/signin`, `/signup`), and the authenticated app (`/dashboard` and the other nav paths). Each is `React.lazy`-split so none pays for the others.
- `src/landing/` — the public marketing site. Own design system in `landing.css` (scoped under `.landingRoot`, near-black + gold/indigo, etched-metal surfaces), own hand-rolled router in `routes.ts`, all copy as data in `content.ts`. No Tailwind, no animation library — scroll reveal is IntersectionObserver + CSS. Source copy deck lives in `homepage/copy.txt`.
- `src/features/auth/AuthScreen.tsx` — the standalone `/signin` + `/signup` page. Note `AuthPage.tsx` is a *different*, still-used component: an inline signed-out fallback embedded inside four app pages (TopNav, Broker Connections, Trade Copier, Live Positions).
- `src/App.tsx` — the authenticated app's UI. Plain React, no state library. Lives at `/dashboard`, **not** `/` — the landing site owns the root.
- `src/features/accounts/propFirms.ts` — the prop-firm catalog (`PROP_FIRMS`) is just labels/metadata for the account form's dropdown, not rule logic — adding a firm there doesn't encode any of its actual rules.

## Landing-page claims
The marketing copy is deliberately narrow about broker support, because only `mt5` has a real credential/sync path (see `BrokerConnectionsPage.tsx`) and Tradovate is blocked on a paid API plan. The support table in `src/landing/content.ts` (`FEATURE_PAGES` → `broker-connections` → `table`) is the single place that status is stated — update it in the same change that wires up a broker, never separately.

## Conventions
- Money formatting: whole dollars, `toLocaleString()`. Dates: ISO strings in DB.
- `Account.maxDrawdown`/`dailyLossLimit`/`trailingDrawdown`/`profitTarget`/`minTradingDays` are plain user-entered fields on the account — no rule logic currently derives, enforces, or auto-fills them.
