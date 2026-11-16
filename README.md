# Finnance

A private, modular personal finance dashboard with an AI assistant. See the [design](docs/superpowers/specs/2026-11-15-finnance-design.md) for the full vision and roadmap.

**Status:** Phase 2a-2 (goals): goals that credit themselves from real transfers and spending, in priority order, with projections from your recent pace or your plan. Built on Phase 2a-1 (budget plans: log income, buckets that split each income or budget each month, move tasks, health check), Phase 1c (income and recurring), 1b (automatic sorting), 1a (accounts, import, transactions), and Phase 0 (private sign-in with two-factor, installable on phones).

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
