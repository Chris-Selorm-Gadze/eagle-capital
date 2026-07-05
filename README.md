# Prop Tracker

Local-first dashboard for tracking prop-firm accounts across FundedNext (CFD) and Apex Trader Funding (futures). All data stays in your browser (IndexedDB) — no server, no login.

Tracks per account: balance, trailing drawdown / max-loss room, self-imposed risk limits, circuit-breaker state, payout eligibility (Apex legacy PA gates), and FundedNext Pro scale-up progress.

## Quickstart

```bash
npm install
npm test        # verify the encoded firm rules
npm run dev     # open http://localhost:5173
```

## Push to GitHub

```bash
git init && git add -A && git commit -m "scaffold: domain rules + data layer"
gh repo create prop-tracker --private --source=. --push
```

## Where things are

| Path | What |
|---|---|
| `PLAN.md` | Milestone-by-milestone build plan (start here) |
| `CLAUDE.md` | Context for Claude Code sessions |
| `src/domain/` | Firm rules + risk math, fully tested |
| `src/db/` | Dexie schema + seeded accounts |

## Disclaimer

Personal tracking tool. Rule constants were verified July 2026 against the firms' help centers — prop firms change rules often, so re-verify before relying on any number. Not financial advice.
