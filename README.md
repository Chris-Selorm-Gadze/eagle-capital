# EagleCapital

A personal trading operations suite — started as a prop-firm account tracker, has grown into a
full toolkit spanning account tracking, live broker sync, trade copying, journaling, and AI-backed
review. No firm's rules or risk math are hardcoded in anywhere; every number is either user-entered
or pulled live from a real broker. Data is per-user in Supabase (sign in required).

## What's in here

- **Accounts** — prop-firm challenges/evaluations/funded accounts *and* real live broker accounts,
  side by side. No firm's rules are encoded; risk limits, payouts, rewards, and funded dates are
  all manual entry, since every firm's math is different.
- **Broker Connections** — links real accounts to their actual broker: MT4/5 via
  [MetaApi.cloud](https://metaapi.cloud) (live-verified against a real account), Tradovate
  (built, blocked pending a paid Tradovate API plan). One login can expose several real accounts
  (Tradovate/Topstep-style prop platforms) — the app fetches the real list and lets you pick which
  to import, rather than assuming one login = one account.
- **Trade Copier** — real-time trade copying between connected MT4/5 accounts, built on MetaApi's
  CopyFactory. Master/follower grouping, live P&L via WebSocket, risk-profile stopouts/unlock,
  flatten-all. CopyFactory is MT4/5-only; futures-broker copying (Tradovate/Topstep) would need its
  own execution engine and isn't built.
- **Trade Journal & Trade Log** — manual entry or CSV import (MT4/5-style exports), a 3-pane
  journal (list / stats·tags·notes·strategy / live price chart), and playbooks with real
  performance stats tied to logged trades.
- **Trader Management** — a daily Report Card (execution checklist built from *your own* rules, not
  a generic list, the "5 Whys" process review) and a personal rules library, independent of any
  prop firm.
- **AI Insights** — two layers: free, instant, deterministic pattern detection (revenge trading,
  overtrading, size escalation — computed straight from your trade log, no API call) plus an
  on-demand Claude-generated coaching digest you trigger manually.
- **Economic Calendar** — real structured release data (not an embed), filterable by impact and
  by country/instrument.
- **Charting** — a full TradingView "Advanced Chart" widget for any symbol.
- **Observability** — Sentry (errors/performance) and PostHog (usage analytics, capture
  deliberately conservative — no session replay, autocapture text/attributes masked — since the UI
  shows real balances and trade data).

The broker sync/copier backend (credential handling, live MetaApi/Tradovate/CopyFactory calls,
sync scheduler) lives in a separate repo, `eaglecapital-broker-sync` — see its own README for that
side of the system.

## Quickstart

```bash
npm install
npm test        # run the test suite
npm run dev     # open http://localhost:5173
```

Requires a Supabase project — see `.env.example` for the env vars to set in `.env.local`, and run `supabase/schema.sql` against your project's SQL editor.

## Deployment

Frontend deploys on Vercel; the broker-sync/copier backend deploys separately on Railway (see
`eaglecapital-broker-sync`). Both need their own env vars set in each platform's dashboard —
`.env.local`/`.env` files never reach production on their own.

The GitHub remote is still named `prop-tracker` (`github.com/Chris-Selorm-Gadze/prop-tracker`)
from before the app outgrew that name — renaming it is a deliberate call to make later (affects
clone URLs and any CI/deploy hooks tied to it), not something to do in passing.

## Where things are

| Path | What |
|---|---|
| `PLAN.md` | Build history (historical — see `CLAUDE.md` for current architecture) |
| `CLAUDE.md` | Context for Claude Code sessions |
| `supabase/schema.sql` | Postgres schema + RLS policies |
| `src/db/` | Supabase-backed data access (accounts, sessions, payouts, rewards, trades, report cards, playbooks, trading rules, broker connections) |
| `src/features/accounts/` | Prop-firm + live account management, risk cockpit |
| `src/features/brokers/` | Broker connection UI (MT4/5, Tradovate) |
| `src/features/copier/` | Trade Copier page |
| `src/features/trades/` | Trade Log + Trade Journal |
| `src/features/playbooks/` | Setup library with performance stats and PDF/Word export |
| `src/features/reportcard/`, `src/features/tradermanagement/` | Daily Report Card, personal rules |
| `src/features/insights/` | AI Insights (pattern detection + Claude digest) |
| `src/features/calendar/`, `src/features/charting/` | Economic Calendar, TradingView charting |
| `src/lib/sentry.ts`, `src/lib/posthog.ts` | Observability wiring |
| `eaglecapital-broker-sync/` (separate repo) | Broker credential handling, live sync, CopyFactory copier backend |

## Disclaimer

Personal tool for tracking accounts and journaling trades — not financial advice, and not a
substitute for your own risk judgment. No firm's rules or risk math are encoded anywhere; the
Trade Copier mirrors real orders between accounts you connect, so treat it with the same care as
any other live-trading tool.
