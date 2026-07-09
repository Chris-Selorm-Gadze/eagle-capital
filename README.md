# EagleCapital

Dashboard for tracking prop-firm accounts across any prop firm — no firm's rules are hardcoded in. Data is per-user in Supabase (sign in required).

Tracks per account: balance, user-entered risk limits, manual payout/reward/funded-date logging, trade log/journal, and a daily report card for reviewing your own trading process.

## Quickstart

```bash
npm install
npm test        # run the test suite
npm run dev     # open http://localhost:5173
```

Requires a Supabase project — see `.env.example` for the env vars to set in `.env.local`, and run `supabase/schema.sql` against your project's SQL editor.

## Push to GitHub

```bash
git init && git add -A && git commit -m "scaffold: domain rules + data layer"
gh repo create prop-tracker --private --source=. --push
```

## Where things are

| Path | What |
|---|---|
| `PLAN.md` | Build history (historical — see `CLAUDE.md` for current architecture) |
| `CLAUDE.md` | Context for Claude Code sessions |
| `supabase/schema.sql` | Postgres schema + RLS policies |
| `src/db/` | Supabase-backed data access (accounts, sessions, payouts, rewards, trades, report cards) |

## Disclaimer

Personal tracking tool, not financial advice. No firm's rules are encoded — enter your own account limits.
