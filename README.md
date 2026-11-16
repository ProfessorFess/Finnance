# Finnance

A private, modular personal finance dashboard with an AI assistant. See the [design](docs/superpowers/specs/2026-11-15-finnance-design.md) for the full vision and roadmap.

**Status:** Phase 1c (income and recurring): paychecks, bills, and subscriptions entered once and matched to imports automatically; late vs. waiting-for-import status; suggestions for repeating charges. Built on Phase 1b (automatic sorting: rules, past choices, Claude Haiku, transfer matching, review queue), Phase 1a (accounts, multi-file import, transactions), and Phase 0 (private sign-in with two-factor, installable on phones).

Conventions every change follows: [docs/conventions.md](docs/conventions.md).

## Stack

Next.js 16 (App Router, TypeScript) · Postgres + Drizzle ORM · Better Auth · Tailwind CSS + shadcn/ui · Vitest + Playwright · Vercel + Neon

## Local development

Requires Node 24, pnpm, and Docker Desktop.

```bash
pnpm install
```

```bash
cp .env.example .env.local   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
```

```bash
pnpm db:up && pnpm db:migrate
```

```bash
pnpm create-owner            # create your local login
```

```bash
pnpm dev                     # http://localhost:3000
```

## Checks

| Command | What it runs |
|---|---|
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit and integration tests (Vitest + in-memory Postgres) |
| `pnpm test:e2e` | Browser tests (Playwright; needs `pnpm db:up`) |

## Deploying

See [docs/setup.md](docs/setup.md) for the owner's step-by-step setup on Vercel and Neon.
