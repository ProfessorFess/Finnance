# Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployed, private Finnance app shell. The owner can sign in on their phone (with optional 2FA), and it has responsive navigation, theming, and PWA install, plus the database, auth, test, and CI foundations that later phases build on.

**Architecture:** One Next.js 16 App Router app in TypeScript.
- **Database:** Postgres via Drizzle ORM. node-postgres `pg` connects to local Docker Postgres, the CI Postgres service, and Neon in production. Tests run Postgres in-process with PGlite.
- **Auth:** Better Auth (email + password, TOTP 2FA, database-backed rate limiting). Signup is closed by an environment flag, and the owner's login is created by a CLI script the owner runs themselves.
- **Deployment:** Vercel, with Neon attached through the Vercel Marketplace (one database branch per preview deployment). Migrations run in the Vercel build.

**Tech Stack:**
- next 16.4.x, react 19.3.x, typescript (the version create-next-app installs), tailwindcss 4.3.x, shadcn 4.23.x, next-themes 0.4.x, lucide-react;
- drizzle-orm 0.45.x, drizzle-kit 0.31.x, pg 8.23.x, @electric-sql/pglite 0.5.x, @vercel/functions 3.11.x;
- better-auth 1.7.25 (CLI package: `auth@1.7.25`), zod 4.6.x, react-qr-code 2.2.x, @inquirer/prompts 8.x, tsx 4.23.x;
- vitest 5.1.x, @playwright/test 1.65.x, otpauth 9.6.x.

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md` (Phase 0 is in section 16; also sections 3, 5, 14, and 15).

## Global Constraints

- Node 24, pnpm. TypeScript `strict: true`. Import alias `@/*` → `src/*`.
- **Signup:** closed unless `ALLOW_SIGNUP` is exactly the string `true`. The owner's login is created only by `pnpm create-owner`.
- **Passwords:** at least 12 characters (`minPasswordLength: 12`).
- **Secrets:** only in environment variables. `.env*.local` is gitignored. Error messages and logs never include secret values.
- **Owner's own steps:** the builder never handles the owner's passwords and never creates the owner's Vercel, Neon, or other accounts. Those steps are owner checkpoints (Task 8).
- **Domain:** the default `*.vercel.app` domain. No custom domain.
- **Design:**
  - calm, confident, trustworthy;
  - one accent color;
  - green only for money in, red only for problems;
  - light and dark themes;
  - tabular numerals for numbers;
  - mobile-first, with no horizontal scroll at 375px width;
  - empty states point to the next action.
- **Navigation labels:**
  - Desktop sidebar: `Home, Transactions, Plan, Goals, Recurring, Accounts, Import, Settings`.
  - Mobile bottom tabs: `Home, Transactions, Assistant, Plan, More`, with Assistant as the raised center button.
- **Forward-compatibility** (no Phase 0 code needed, but don't contradict): money will be integer cents; every user-data query will take `userId`; AI model IDs will live in config.
- **Pushing to GitHub** (`git@github.com:ProfessorFess/Finnance.git`) needs the owner's go-ahead at execution time. Commit locally freely.

## Review Focus

1. **Direct signup attempts.** A `POST /api/auth/sign-up/email` while signup is closed must fail and create no user, even though the UI has no signup page. → Task 2 test `rejects sign-up over HTTP when signup is closed`.
2. **Password guessing.** Repeated wrong passwords must be rate-limited (HTTP 429 after 5 attempts per minute from one IP). Unknown emails and wrong passwords must get the same error, so attackers can't confirm the owner's email. → Task 2 tests `rate-limits sign-in after 5 attempts per minute` and `returns the same error for unknown email and wrong password`.
3. **Open redirect via `?next=`.** A link like `/sign-in?next=https://evil.example` or `//evil.example` must land on `/` after sign-in, never off-site. → Task 4 unit test `safeNextPath` and e2e `ignores an off-site next parameter`.
4. **Lost authenticator.** If the owner loses their phone's authenticator app, a backup code must still let them in, exactly once per code. → Task 6 test `backup code completes sign-in once`.
5. **Phone layout.** At 375px width, the bottom tab bar must not be hidden behind the iPhone home indicator (safe-area inset) and the page must not scroll sideways. → Task 5 e2e `has no horizontal scroll at 375px` and the `viewportFit: "cover"` + `env(safe-area-inset-bottom)` requirement.

---

## File Structure

```
.github/workflows/ci.yml          CI: typecheck, lint, unit, e2e
docker-compose.yml                local Postgres 17 (dbs: finnance, finnance_test)
docker/init-test-db.sql           creates finnance_test
.env.example                      documented env vars (no real secrets)
drizzle.config.ts                 drizzle-kit config
drizzle/                          generated SQL migrations
vercel.json                       build command (migrate + build)
playwright.config.ts
vitest.config.ts
docs/setup.md                     owner's setup checklist (accounts, secrets, first login)
scripts/create-owner.ts           interactive CLI: owner types name/email/password
e2e/
  global-setup.ts                 migrate + reset test DB + create e2e users
  fixtures.ts                     e2e test credentials (test-only values)
  auth.spec.ts  shell.spec.ts  security.spec.ts
src/
  proxy.ts                        optimistic auth redirect with ?next=
  server/
    env.ts (+ env.test.ts)        parseEnv / getEnv
    db/
      client.ts                   getDb() pg pool singleton
      schema.ts                   re-exports all tables
      auth-schema.ts              generated by Better Auth CLI
      types.ts                    Database type
    auth/
      auth.ts (+ auth.test.ts)    createAuth(db, options)
      index.ts                    auth singleton for the app + CLI
      create-owner.ts (+ test)    createOwner(auth, input)
      session.ts                  getSession / requireUser
      two-factor.test.ts
  test/
    db.ts                         createTestDb() (PGlite + migrations)
    auth-helpers.ts               signInForCookie() for server tests
  lib/
    auth-client.ts                Better Auth React client
    safe-next.ts (+ test)         safeNextPath
  app/
    layout.tsx  globals.css  manifest.ts  apple-icon.png  icon.svg
    api/auth/[...all]/route.ts
    (auth)/sign-in/page.tsx  (auth)/sign-in/sign-in-form.tsx
    (app)/layout.tsx              requireUser + AppShell
    (app)/page.tsx                Home placeholder
    (app)/{transactions,plan,goals,recurring,accounts,import}/page.tsx
    (app)/settings/page.tsx  (app)/settings/security/page.tsx
  components/
    shell/{app-shell,sidebar,bottom-tabs,more-sheet,assistant-sheet,theme-toggle,sign-out-button}.tsx
    shell/nav-items.ts
    empty-state.tsx
    settings/two-factor-card.tsx
    ui/                           shadcn components
public/icons/icon-192.png  icon-512.png  icon-maskable-512.png
```

---

### Task 1: Project scaffold and environment validation

**Files:**
- Create: the Next.js scaffold, `vitest.config.ts`, `.env.example`, `src/server/env.ts`
- Modify: `package.json` (scripts), `.gitignore`
- Test: `src/server/env.test.ts`

**Interfaces:**
- Produces:
  - `type Env = { databaseUrl: string; authSecret: string; authBaseUrl: string; trustedOrigins: string[]; allowSignup: boolean; anthropicApiKey?: string }`
  - `parseEnv(source: Record<string, string | undefined>): Env`
  - `getEnv(): Env` (parses `process.env` once and caches)
  - package scripts: `dev, build, start, lint, typecheck, test, test:e2e, db:up, db:generate, db:migrate, create-owner`

- [ ] **Step 1: Scaffold the app**

Run: `pnpm create next-app@16.4.6 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm`

If it refuses because the directory isn't empty (`docs/`, `.git`), scaffold into `./.scaffold` and move its contents up (including dotfiles), then delete `./.scaffold`.

Set `"strict": true` in `tsconfig.json` (create-next-app sets it already; confirm). Add `"packageManager"` and `"engines": { "node": ">=24" }` to `package.json`.

- [ ] **Step 2: Add Vitest**

Run: `pnpm add -D vitest@^5.1.0 vite-tsconfig-paths`

`vitest.config.ts`: Node environment, `include: ["src/**/*.test.ts"]`, `tsconfigPaths()` plugin, `testTimeout: 20000` (PGlite startup).

Scripts:
- `"test": "vitest run"`
- `"typecheck": "tsc --noEmit"`

- [ ] **Step 3: Write the failing test** `src/server/env.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/finnance",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("parses a valid environment with signup closed by default", () => {
    const env = parseEnv(valid);
    expect(env.databaseUrl).toBe(valid.DATABASE_URL);
    expect(env.authBaseUrl).toBe("http://localhost:3000");
    expect(env.allowSignup).toBe(false);
    expect(env.anthropicApiKey).toBeUndefined();
  });

  it("throws naming every missing variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("rejects a short auth secret without echoing it", () => {
    const run = () => parseEnv({ ...valid, BETTER_AUTH_SECRET: "tooshort-secret-value" });
    expect(run).toThrow(/BETTER_AUTH_SECRET/);
    expect(run).not.toThrow(/tooshort-secret-value/);
  });

  it("only opens signup for the exact string 'true'", () => {
    expect(parseEnv({ ...valid, ALLOW_SIGNUP: "true" }).allowSignup).toBe(true);
    for (const v of ["TRUE", "1", "yes", "false", ""]) {
      expect(parseEnv({ ...valid, ALLOW_SIGNUP: v }).allowSignup).toBe(false);
    }
  });

  it("derives the auth URL from VERCEL_URL when BETTER_AUTH_URL is unset", () => {
    const env = parseEnv({ ...valid, BETTER_AUTH_URL: undefined, VERCEL_URL: "finnance-abc.vercel.app" });
    expect(env.authBaseUrl).toBe("https://finnance-abc.vercel.app");
  });

  it("trusts the base URL and Vercel preview URLs as origins", () => {
    const env = parseEnv({ ...valid, VERCEL_URL: "finnance-abc.vercel.app", VERCEL_BRANCH_URL: "finnance-git-x.vercel.app" });
    expect(env.trustedOrigins).toEqual(
      expect.arrayContaining(["http://localhost:3000", "https://finnance-abc.vercel.app", "https://finnance-git-x.vercel.app"]),
    );
  });

  it("requires BETTER_AUTH_URL when not on Vercel", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: undefined })).toThrow(/BETTER_AUTH_URL/);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test src/server/env.test.ts`
Expected: FAIL (cannot resolve `./env`).

- [ ] **Step 5: Implement `parseEnv` and `getEnv` in `src/server/env.ts`**

Use a Zod 4 object schema. On failure, throw `Error("Invalid environment: " + issues.map(i => i.path.join(".")).join(", "))`. List variable names only, never values.
- `BETTER_AUTH_SECRET`: min length 32.
- `DATABASE_URL`: must parse as a URL.
- `ANTHROPIC_API_KEY`: optional.
- Empty strings count as unset.

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm test src/server/env.test.ts`
Expected: 7 passed.

- [ ] **Step 7: Write `.env.example` and update `.gitignore`**

`.env.example`, each line with a one-line comment:
```
DATABASE_URL=postgres://finnance:finnance@localhost:5432/finnance
BETTER_AUTH_SECRET=        # generate: openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGNUP=false
ANTHROPIC_API_KEY=         # not used until Phase 2b
```

`.gitignore` must cover `.env*.local`, `.env.production*`, `/test-results`, `/playwright-report`, `/e2e/.auth`, and `/.scaffold`.

- [ ] **Step 8: Verify the scaffold**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all succeed.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with env validation and Vitest"
```

---

### Task 2: Database layer and Better Auth core

**Files:**
- Create:
  - `docker-compose.yml`, `docker/init-test-db.sql`, `drizzle.config.ts`;
  - `src/server/db/{client,schema,auth-schema,types}.ts`;
  - `src/server/auth/auth.ts`, `src/server/auth/index.ts`, `src/test/db.ts`;
  - `drizzle/*` (generated).
- Modify: `package.json` (db scripts)
- Test: `src/server/auth/auth.test.ts`

**Interfaces:**
- Consumes: `getEnv()` (Task 1).
- Produces:
  - `type Database = PgDatabase<PgQueryResultHKT, typeof schema>` (from `drizzle-orm/pg-core`), in `src/server/db/types.ts`;
  - `getDb(): Database`: a lazy singleton over a `pg.Pool` using `getEnv().databaseUrl`. When `process.env.VERCEL` is set, call `attachDatabasePool(pool)` from `@vercel/functions`;
  - `schema` (all tables), exported from `src/server/db/schema.ts`. Includes Better Auth's `user, session, account, verification, twoFactor, rateLimit`;
  - `createAuth(db: Database, options: { baseURL: string; secret: string; trustedOrigins?: string[]; allowSignup: boolean; rateLimitEnabled?: boolean })`, plus `type Auth = ReturnType<typeof createAuth>`;
  - `auth: Auth` in `src/server/auth/index.ts`, built from `getDb()` and `getEnv()`, with `rateLimitEnabled: process.env.NODE_ENV === "production"`;
  - `createTestDb(): Promise<{ db: Database; close: () => Promise<void> }>`: in-memory PGlite with `migrate(db, { migrationsFolder: "drizzle" })` applied.

- [ ] **Step 1: Local Postgres**

`docker-compose.yml`:
- service `postgres` from `postgres:17`;
- env `POSTGRES_USER=finnance`, `POSTGRES_PASSWORD=finnance`, `POSTGRES_DB=finnance`;
- port `5432:5432`;
- a volume for data;
- `docker/init-test-db.sql` (`CREATE DATABASE finnance_test;`) mounted into `/docker-entrypoint-initdb.d/`.

Scripts:
- `"db:up": "docker compose up -d postgres"`
- `"db:generate": "drizzle-kit generate"`
- `"db:migrate": "drizzle-kit migrate"`

Run: `pnpm db:up`, then copy `.env.example` to `.env.local` with a generated secret.
Expected: `docker compose ps` shows postgres healthy.

- [ ] **Step 2: Install dependencies**

Run: `pnpm add drizzle-orm@^0.45.4 pg@^8.23.1 better-auth@1.7.25 @vercel/functions@^3.11.3 zod && pnpm add -D drizzle-kit@^0.31.11 @types/pg @electric-sql/pglite@^0.5.16 dotenv`

`drizzle.config.ts`:
- `dialect: "postgresql"`, `schema: "./src/server/db/schema.ts"`, `out: "./drizzle"`;
- `dbCredentials.url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL` (Neon's integration provides the unpooled URL for migrations);
- load `.env.local` with dotenv when present.

- [ ] **Step 3: Write `createAuth` config and generate the auth schema**

`createAuth` options:
- `database: drizzleAdapter(db, { provider: "pg", schema })` (import from `better-auth/adapters/drizzle`);
- `emailAndPassword: { enabled: true, disableSignUp: !allowSignup, minPasswordLength: 12 }`;
- `plugins: [twoFactor({ issuer: "Finnance" }), nextCookies()]` (`nextCookies` last);
- `rateLimit: { enabled: rateLimitEnabled ?? false, storage: "database", window: 60, max: 100, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/two-factor/verify-totp": { window: 60, max: 5 }, "/two-factor/verify-backup-code": { window: 60, max: 5 } } }`;
- `baseURL`, `secret`, `trustedOrigins`.

Write `createAuth` first without passing `schema` to `drizzleAdapter` (the schema doesn't exist yet). With `.env.local` loaded (`set -a; source .env.local; set +a`), run `pnpm dlx auth@1.7.25 generate --config src/server/auth/index.ts --output src/server/db/auth-schema.ts`. Re-export it from `schema.ts`, then pass `schema` to the adapter.

Run: `pnpm db:generate && pnpm db:migrate`
Expected: one migration in `drizzle/`, applied to local Postgres.

- [ ] **Step 4: Write the failing test** `src/server/auth/auth.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { user } from "@/server/db/schema";
import { createAuth, type Auth } from "./auth";

const BASE = "http://localhost:3000";
const opts = { baseURL: BASE, secret: "s".repeat(32), trustedOrigins: [BASE] };
let t: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => { t = await createTestDb(); });
afterEach(async () => { await t.close(); });

const post = (auth: Auth, path: string, body: unknown, ip = "203.0.113.5") =>
  auth.handler(new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }));

const owner = { name: "Owner", email: "owner@example.com", password: "a-long-test-password" };

describe("createAuth", () => {
  it("rejects sign-up over HTTP when signup is closed", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: false });
    const res = await post(auth, "/sign-up/email", owner);
    expect(res.ok).toBe(false);
    expect(await t.db.select().from(user)).toHaveLength(0);
  });

  it("allows sign-up when signup is open", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    expect((await post(auth, "/sign-up/email", owner)).ok).toBe(true);
    expect(await t.db.select().from(user)).toHaveLength(1);
  });

  it("rejects passwords shorter than 12 characters", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    expect((await post(auth, "/sign-up/email", { ...owner, password: "short-pass1" })).ok).toBe(false);
  });

  it("returns the same error for unknown email and wrong password", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: true });
    await post(auth, "/sign-up/email", owner);
    const unknown = await post(auth, "/sign-in/email", { email: "nobody@example.com", password: owner.password });
    const wrong = await post(auth, "/sign-in/email", { email: owner.email, password: "wrong-password-123" });
    expect(unknown.status).toBe(wrong.status);
    expect((await unknown.json()).message).toBe((await wrong.json()).message);
  });

  it("rate-limits sign-in after 5 attempts per minute", async () => {
    const auth = createAuth(t.db, { ...opts, allowSignup: false, rateLimitEnabled: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await post(auth, "/sign-in/email", { email: owner.email, password: "wrong-password-123" })).status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm test src/server/auth/auth.test.ts`
Expected: FAIL (`createTestDb` not defined).

- [ ] **Step 6: Implement `createTestDb` in `src/test/db.ts` and `getDb` in `src/server/db/client.ts`**

`createTestDb`: `new PGlite()`, then `drizzle(client, { schema })` from `drizzle-orm/pglite`, then `migrate` from `drizzle-orm/pglite/migrator`. `close` calls `client.close()`.

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm test`
Expected: all Task 1 and Task 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle database layer and Better Auth with closed signup and rate limiting"
```

---

### Task 3: Owner account creation

**Files:**
- Create: `src/server/auth/create-owner.ts`, `scripts/create-owner.ts`
- Modify: `package.json` (`"create-owner": "tsx scripts/create-owner.ts"`)
- Test: `src/server/auth/create-owner.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `Auth`, `createTestDb` (Task 2).
- Produces: `createOwner(auth: Auth, input: { name: string; email: string; password: string }): Promise<{ id: string; email: string }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createAuth, type Auth } from "./auth";
import { createOwner } from "./create-owner";

let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;
const input = { name: "Owner", email: "owner@example.com", password: "a-long-test-password" };

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { baseURL: "http://localhost:3000", secret: "s".repeat(32), allowSignup: false });
});
afterEach(async () => { await t.close(); });

describe("createOwner", () => {
  it("creates a user who can sign in while signup is closed", async () => {
    await createOwner(auth, input);
    const res = await auth.api.signInEmail({ body: { email: input.email, password: input.password } });
    expect(res.user.email).toBe("owner@example.com");
  });

  it("normalizes the email", async () => {
    const created = await createOwner(auth, { ...input, email: "  Owner@Example.COM " });
    expect(created.email).toBe("owner@example.com");
  });

  it("refuses a duplicate email", async () => {
    await createOwner(auth, input);
    await expect(createOwner(auth, input)).rejects.toThrow(/already exists/);
  });

  it("refuses passwords shorter than 12 characters", async () => {
    await expect(createOwner(auth, { ...input, password: "short-pass1" })).rejects.toThrow(/at least 12/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/server/auth/create-owner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `createOwner`**

Approach:
1. `const ctx = await auth.$context`.
2. Check `ctx.internalAdapter.findUserByEmail`, then throw `Error("A user with this email already exists")`.
3. Enforce the 12-character minimum: `Error("Password must be at least 12 characters")`.
4. `ctx.internalAdapter.createUser({ name, email, emailVerified: true })`.
5. `ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: await ctx.password.hash(password) })`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/server/auth/create-owner.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write `scripts/create-owner.ts`**

- Run `pnpm add -D tsx @inquirer/prompts`.
- Accept an optional `--env-file <path>` (default `.env.local`) and load it before importing `@/server/auth`.
- Prompt with `input` for name and email, and with `password` (masked) twice, requiring a match.
- Call `createOwner`, then print `Owner created: <email>`. Never print the password.
- Exit non-zero with the error message on failure.

Run (manual, local DB): `pnpm create-owner`, then enter test values.
Expected: `Owner created: …`. Running it again with the same email prints the "already exists" error.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add owner creation CLI"
```

---

### Task 4: Sign-in flow, route protection, and e2e harness

**Files:**
- Create:
  - `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/lib/safe-next.ts`;
  - `src/server/auth/session.ts`, `src/proxy.ts`;
  - `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-in/sign-in-form.tsx`;
  - `src/app/(app)/layout.tsx` (minimal: `requireUser()` + children; Task 5 wraps it in the shell), `src/app/(app)/page.tsx` (temporary "Home");
  - `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/fixtures.ts`.
- Test: `src/lib/safe-next.test.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `auth` (Task 2), `createOwner` (Task 3).
- Produces:
  - `safeNextPath(next: string | null | undefined): string`;
  - `getSession(): Promise<{ user: User; session: Session } | null>`;
  - `requireUser(): Promise<User>` (redirects to `/sign-in` when there's no session);
  - `authClient` (`createAuthClient` from `better-auth/react` with `twoFactorClient()`);
  - e2e fixtures in `e2e/fixtures.ts`:
    - `OWNER = { email: "owner@e2e.test", password: "e2e-owner-password-123" }`;
    - `TWOFA_USER = { email: "twofa@e2e.test", password: "e2e-twofa-password-123" }`;
    - `OWNER_STATE = "e2e/.auth/owner.json"`;
    - `signIn(page: Page, user: { email: string; password: string }): Promise<void>`. It first sets a random `x-forwarded-for` (`10.<r>.<r>.<r>`) with `page.context().setExtraHTTPHeaders`, so each sign-in counts against its own rate-limit bucket (the e2e server runs a production build, where the 5-per-minute limit is on), then fills `Email` / `Password` and clicks `Sign in`.

  On Vercel the real client IP overwrites `x-forwarded-for`, so this trick doesn't weaken production.

- [ ] **Step 1: Write the failing unit test** `src/lib/safe-next.test.ts`

```ts
import { expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

it.each([
  ["/goals", "/goals"],
  ["/settings/security?tab=2fa", "/settings/security?tab=2fa"],
  [null, "/"], [undefined, "/"], ["", "/"],
  ["https://evil.example", "/"], ["//evil.example", "/"], ["/\\evil.example", "/"],
  ["javascript:alert(1)", "/"], ["/sign-in", "/"],
])("safeNextPath(%j) -> %j", (input, expected) => {
  expect(safeNextPath(input)).toBe(expected);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/safe-next.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `safeNextPath`**

Accept only strings that start with a single `/`, are not followed by `/` or `\`, and don't point back to `/sign-in`. Everything else returns `/`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/lib/safe-next.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Wire auth into Next.js**

- `route.ts`: `export const { GET, POST } = toNextJsHandler(auth)` from `better-auth/next-js`.
- `session.ts`: `auth.api.getSession({ headers: await headers() })`.
- `proxy.ts` (Next 16's replacement for `middleware.ts`):
  - for every path except `/sign-in`, `/api/auth/*`, `/_next/*`, static files, `manifest.webmanifest`, and `icons/*`: if `getSessionCookie(request)` (from `better-auth/cookies`) is absent, redirect to `/sign-in?next=<pathname+search>`;
  - this is an optimistic check only. `(app)/layout.tsx` calls `requireUser()` for the real one.
- Sign-in page:
  - if already signed in, redirect to `safeNextPath(next)`.
  - The form calls `authClient.signIn.email`. When the result has `twoFactorRedirect`, show a 6-digit code step using `authClient.twoFactor.verifyTotp({ code })`, with a "Use a backup code" link (`verifyBackupCode`).
  - Success: `router.replace(safeNextPath(next))`.
  - Error copy is exactly `Invalid email or password.`, and for 429 `Too many attempts. Try again in a minute.`
  - Labels: `Email`, `Password`, `Sign in`, `Authentication code`, `Verify`.

- [ ] **Step 6: Set up Playwright**

Run: `pnpm add -D @playwright/test@^1.65.1 && pnpm exec playwright install chromium`

`playwright.config.ts`:
- `testDir: "e2e"`;
- projects `setup` (`testMatch: /auth\.setup\.ts/`), `desktop` (Desktop Chrome, 1280×800), and `mobile` (`devices["Pixel 7"]`). Desktop and mobile both have `dependencies: ["setup"]`;
- `globalSetup: "./e2e/global-setup.ts"`;
- `webServer: { command: "pnpm build && pnpm start -p 3100", url: "http://localhost:3100/sign-in", reuseExistingServer: !process.env.CI, env }`;
- `use.baseURL: "http://localhost:3100"`.

`env`, defaults overridable by `process.env`:
- `DATABASE_URL=postgres://finnance:finnance@localhost:5432/finnance_test`;
- `BETTER_AUTH_SECRET` (a fixed 32+ character test-only string);
- `BETTER_AUTH_URL=http://localhost:3100`;
- `ALLOW_SIGNUP=false`.

`global-setup.ts`:
1. Run drizzle migrations against `DATABASE_URL` (`drizzle-orm/node-postgres/migrator`).
2. `TRUNCATE "user" CASCADE` and `TRUNCATE "rateLimit"` (use the table names the generated schema defines).
3. `createOwner` for `OWNER` and `TWOFA_USER`.

`e2e/auth.setup.ts`: `signIn(page, OWNER)`, wait for URL `/`, then `page.context().storageState({ path: OWNER_STATE })`. Gitignore `e2e/.auth/`.

Script: `"test:e2e": "playwright test"`.

- [ ] **Step 7: Write the failing e2e test** `e2e/auth.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./fixtures";

test("redirects an unauthenticated deep link to sign-in, then back", async ({ page }) => {
  await page.goto("/goals");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fgoals/);
  await signIn(page, OWNER);
  await expect(page).toHaveURL(/\/goals$/);
});

test("shows a generic error for a wrong password", async ({ page }) => {
  await page.goto("/sign-in");
  await signIn(page, { email: OWNER.email, password: "definitely-wrong-password" });
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("ignores an off-site next parameter", async ({ page }) => {
  await page.goto("/sign-in?next=https://evil.example");
  await signIn(page, OWNER);
  await expect(page).toHaveURL("http://localhost:3100/");
});
```

The `/goals` route doesn't exist yet. Add a temporary `(app)/goals/page.tsx` with heading `Goals` (Task 5 replaces it).

- [ ] **Step 8: Run e2e and make it pass**

Run: `pnpm db:up && pnpm test:e2e e2e/auth.spec.ts`
Expected: 7 passed (the setup test, plus 3 tests × 2 projects).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add sign-in flow with 2FA step, route protection, and Playwright harness"
```

---

### Task 5: App shell, design system, placeholder pages, and PWA

**Files:**
- Create:
  - `src/components/shell/*`, `src/components/empty-state.tsx`, `src/components/ui/*` (shadcn);
  - `src/app/(app)/{transactions,plan,goals,recurring,accounts,import}/page.tsx`, `src/app/(app)/settings/page.tsx`;
  - `src/app/manifest.ts`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icons/*`.
- Modify: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`
- Test: `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `requireUser`, `authClient` (Task 4).
- Produces:
  - `navItems: { href: string; label: string; icon: LucideIcon; mobileTab: boolean }[]` in `nav-items.ts`;
  - `<AppShell user={user}>{children}</AppShell>`;
  - `<EmptyState title description phase? action? />`;
  - `<SignOutButton />` (calls `authClient.signOut()`, then `router.replace("/sign-in")`).

- [ ] **Step 1: Load design guidance**

Invoke the `frontend-design` skill and apply it within spec section 15.

- Run `pnpm dlx shadcn@4.23.0 init`, then add `button card input label sheet separator dropdown-menu sonner`.
- `pnpm add next-themes lucide-react`.
- Define design tokens as CSS variables in `globals.css`, light and dark, with Tailwind v4 `@theme inline`: background, foreground, card, muted, border, ring, **one** accent, `positive` (money in), and `destructive` (problems only).
- Pick the font with `next/font` and apply `font-variant-numeric: tabular-nums` to a `.num` utility.
- Root layout: `ThemeProvider` (class strategy, system default). `export const viewport = { viewportFit: "cover", themeColor: [light, dark] }`.

- [ ] **Step 2: Write the failing e2e test** `e2e/shell.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { OWNER, OWNER_STATE, signIn } from "./fixtures";

test.use({ storageState: OWNER_STATE });
test.beforeEach(async ({ page }) => { await page.goto("/"); });

const desktopLinks = ["Home", "Transactions", "Plan", "Goals", "Recurring", "Accounts", "Import", "Settings"];
const placeholders: [string, string, RegExp][] = [
  ["/", "Home", /Phase 2a/], ["/transactions", "Transactions", /Phase 1/], ["/plan", "Plan", /Phase 2a/],
  ["/goals", "Goals", /Phase 2a/], ["/recurring", "Recurring", /Phase 1/], ["/accounts", "Accounts", /Phase 1/],
  ["/import", "Import", /Phase 1/],
];

test("desktop shows the sidebar and hides bottom tabs", async ({ page, isMobile }) => {
  test.skip(isMobile);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const l of desktopLinks) await expect(nav.getByRole("link", { name: l })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeHidden();
});

test("mobile shows bottom tabs and a More sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  for (const l of ["Home", "Transactions", "Plan"]) await expect(tabs.getByRole("link", { name: l })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Assistant" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await tabs.getByRole("button", { name: "More" }).click();
  for (const l of ["Goals", "Recurring", "Accounts", "Import", "Settings"]) {
    await expect(page.getByRole("dialog").getByRole("link", { name: l })).toBeVisible();
  }
  await expect(page.getByRole("dialog").getByRole("button", { name: "Sign out" })).toBeVisible();
});

for (const [path, heading, phase] of placeholders) {
  test(`placeholder ${path} explains what's coming`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(phase)).toBeVisible();
  });
}

test("assistant button opens the assistant sheet", async ({ page }) => {
  await page.getByRole("button", { name: "Assistant" }).first().click();
  await expect(page.getByRole("dialog").getByText("The assistant arrives in Phase 2b.")).toBeVisible();
});

test("has no horizontal scroll at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [path] of placeholders) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, path).toBe(false);
  }
});

test("theme toggle switches to dark and persists", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("navigation", { name: "Tabs" }).getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Toggle theme" }).first().click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("serves an installable manifest", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ name: "Finnance", short_name: "Finnance", display: "standalone", start_url: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});

test.describe("sign out", () => {
  // Fresh session: signing out revokes it, so it must not be the shared storage state.
  test.use({ storageState: { cookies: [], origins: [] } });
  test("returns to sign-in", async ({ page, isMobile }) => {
    await page.goto("/sign-in");
    await signIn(page, OWNER);
    await expect(page).toHaveURL("http://localhost:3100/");
    if (isMobile) await page.getByRole("navigation", { name: "Tabs" }).getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test:e2e e2e/shell.spec.ts`
Expected: FAIL (no navigation landmarks).

- [ ] **Step 4: Build the shell and pages**

- **Desktop sidebar:** `<nav aria-label="Main">`, shown from `md` (768px) up. Wordmark at the top; navigation links with active state; at the bottom, the theme toggle (a `Toggle theme` dropdown with Light / Dark / System), the user's email, `Sign out`, and an `Assistant` button with a ⌘K / Ctrl+K hint (the shortcut opens the sheet).
- **Mobile bottom tabs:** `<nav aria-label="Tabs">`, below `md`. Fixed to the bottom, with `padding-bottom: env(safe-area-inset-bottom)`. Content gets bottom padding so nothing hides behind the bar.
  - Tabs: Home, Transactions, a raised center **Assistant** button, Plan, and **More**.
  - More opens a bottom sheet with Goals, Recurring, Accounts, Import, Settings, the theme toggle, and Sign out.
- **Assistant sheet:** a right-side panel on desktop and full height on mobile. Body text: `The assistant arrives in Phase 2b.`
- **Placeholder pages:** each has an `h1` with its nav label and an `EmptyState`.

  | Page | Message |
  |---|---|
  | Home | "Your dashboard arrives in Phase 2a." |
  | Transactions | "Importing and reviewing transactions arrives in Phase 1." |
  | Plan | "Paycheck plans and budgets arrive in Phase 2a." |
  | Goals | "Goals arrive in Phase 2a." |
  | Recurring | "Income and bill tracking arrives in Phase 1." |
  | Accounts | "Accounts arrive in Phase 1." |
  | Import | "File import arrives in Phase 1." |
  | Settings | Index linking to `Security`, with other sections listed as "Coming later". |

- **PWA:**
  - `manifest.ts`: name and short_name `Finnance`, `display: "standalone"`, `start_url: "/"`, background and theme colors from the tokens, and icons 192, 512, and maskable 512 (PNG in `public/icons/`, drawn from `icon.svg`, a simple mark in the accent color).
  - `apple-icon.png` at 180×180.

- [ ] **Step 5: Run e2e to verify it passes**

Run: `pnpm test:e2e`
Expected: all auth and shell tests pass on both projects.

- [ ] **Step 6: Check it visually**

Screenshot `/` and `/settings` at 375×812 and 1280×800, in light and dark, and check them against spec section 15. Fix anything off before committing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add responsive app shell, design tokens, placeholder pages, and PWA manifest"
```

---

### Task 6: Security settings: two-factor authentication

**Files:**
- Create: `src/app/(app)/settings/security/page.tsx`, `src/components/settings/two-factor-card.tsx`, `src/test/auth-helpers.ts`
- Test: `src/server/auth/two-factor.test.ts`, `e2e/security.spec.ts`

**Interfaces:**
- Consumes: `createAuth`, `createOwner`, `createTestDb`, `authClient`, `TWOFA_USER`.
- Produces: `signInForCookie(auth: Auth, email: string, password: string): Promise<{ cookie: string; twoFactorRedirect: boolean }>`. It calls `auth.api.signInEmail({ body, returnHeaders: true })` and joins the `set-cookie` name=value pairs into one `cookie` header string.

- [ ] **Step 1: Write the failing server test** `src/server/auth/two-factor.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import { createTestDb } from "@/test/db";
import { signInForCookie } from "@/test/auth-helpers";
import { createAuth, type Auth } from "./auth";
import { createOwner } from "./create-owner";

const email = "owner@example.com";
const password = "a-long-test-password";
let t: Awaited<ReturnType<typeof createTestDb>>;
let auth: Auth;

beforeEach(async () => {
  t = await createTestDb();
  auth = createAuth(t.db, { baseURL: "http://localhost:3000", secret: "s".repeat(32), allowSignup: false });
  await createOwner(auth, { name: "Owner", email, password });
});
afterEach(async () => { await t.close(); });

async function enable2fa() {
  const { cookie } = await signInForCookie(auth, email, password);
  const headers = new Headers({ cookie });
  const { totpURI, backupCodes } = await auth.api.enableTwoFactor({ body: { password }, headers });
  const totp = OTPAuth.URI.parse(totpURI) as OTPAuth.TOTP;
  await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers });
  return { totp, backupCodes };
}

describe("two-factor", () => {
  it("enabling returns a TOTP URI and 10 backup codes, then sign-in requires a code", async () => {
    const { backupCodes } = await enable2fa();
    expect(backupCodes).toHaveLength(10);
    expect((await signInForCookie(auth, email, password)).twoFactorRedirect).toBe(true);
  });

  it("a correct TOTP code completes sign-in and a wrong one fails", async () => {
    const { totp } = await enable2fa();
    const { cookie } = await signInForCookie(auth, email, password);
    const headers = new Headers({ cookie });
    await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers })).rejects.toThrow();
    const ok = await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers });
    expect(ok.user.email).toBe(email);
  });

  it("backup code completes sign-in once", async () => {
    const { backupCodes } = await enable2fa();
    const first = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    await expect(auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: first })).resolves.toBeTruthy();
    const second = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    await expect(auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: second })).rejects.toThrow();
  });

  it("disabling with the password returns to single-step sign-in", async () => {
    const { totp } = await enable2fa();
    const pending = new Headers({ cookie: (await signInForCookie(auth, email, password)).cookie });
    const session = await auth.api.verifyTOTP({ body: { code: totp.generate() }, headers: pending, returnHeaders: true });
    const cookie = session.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    await auth.api.disableTwoFactor({ body: { password }, headers: new Headers({ cookie }) });
    expect((await signInForCookie(auth, email, password)).twoFactorRedirect).toBe(false);
  });
});
```

If Better Auth 1.7's response shapes differ slightly (e.g. `verifyTOTP` returning `{ token, user }`), adjust the assertions to the real shape. **Keep the behaviors under test unchanged.**

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm add -D otpauth@^9.6.0 && pnpm test src/server/auth/two-factor.test.ts`
Expected: FAIL (`signInForCookie` not found).

- [ ] **Step 3: Implement `signInForCookie` in `src/test/auth-helpers.ts`**

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test`
Expected: all unit tests pass.

- [ ] **Step 5: Write the failing e2e test** `e2e/security.spec.ts` (uses `TWOFA_USER`, so other specs are unaffected)

```ts
import { expect, test } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { TWOFA_USER, signIn } from "./fixtures";

test("owner enables 2FA, then sign-in requires a code", async ({ page, isMobile }) => {
  test.skip(isMobile, "stateful flow runs once");
  await page.goto("/sign-in?next=/settings/security");
  await signIn(page, TWOFA_USER);

  await page.getByRole("button", { name: "Enable two-factor authentication" }).click();
  await page.getByLabel("Password").fill(TWOFA_USER.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.getByLabel("Authentication code").fill(totp.generate());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  await page.getByLabel("I've saved these codes").check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Two-factor authentication is on")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await signIn(page, TWOFA_USER);
  await page.getByLabel("Authentication code").fill(totp.generate());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test:e2e e2e/security.spec.ts`
Expected: FAIL (no "Enable two-factor authentication" button).

- [ ] **Step 7: Build the security page**

`TwoFactorCard` states:
- **Off:**
  - "Enable two-factor authentication" opens a password dialog (`Password`, `Continue`), which calls `authClient.twoFactor.enable({ password })`.
  - Next, show a QR code (`react-qr-code`, from `totpURI`) plus the secret as grouped text (`data-testid="totp-secret"`), then an `Authentication code` input with `Verify` (`authClient.twoFactor.verifyTotp`).
  - Next, show the backup codes once (`data-testid="backup-codes"`, a list), with `Copy` and `Download .txt`, a required `I've saved these codes` checkbox, and `Done`.
- **On:** the text "Two-factor authentication is on", plus "Turn off" (password dialog, `authClient.twoFactor.disable`) and "Regenerate backup codes" (password, then show codes as above).

The status comes from `user.twoFactorEnabled`.

Run: `pnpm add react-qr-code@^2.2.0`

- [ ] **Step 8: Run all e2e to verify it passes**

Run: `pnpm test:e2e`
Expected: all specs pass on both projects (the security spec is skipped on mobile).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add two-factor authentication settings with backup codes"
```

---

### Task 7: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: package scripts `typecheck, lint, test, test:e2e, db:migrate`.

- [ ] **Step 1: Write the workflow**

Trigger on `push` to `main` and on `pull_request`. Both jobs run on `ubuntu-latest`, with `pnpm/action-setup` and `actions/setup-node` (Node 24, pnpm cache), then `pnpm install --frozen-lockfile`.
- **Job `check`:** `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- **Job `e2e`:**
  - service `postgres:17` (user, password, and db `finnance`, port 5432, health check `pg_isready`);
  - env `DATABASE_URL=postgres://finnance:finnance@localhost:5432/finnance`, plus `BETTER_AUTH_SECRET` (a fixed test-only value), `BETTER_AUTH_URL=http://localhost:3100`, `ALLOW_SIGNUP=false`;
  - `pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e`;
  - upload `playwright-report/` as an artifact on failure.

- [ ] **Step 2: Validate locally**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all pass (this mirrors the CI steps).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck, lint, unit, and e2e workflow"
```

- [ ] **Step 4: Push and confirm CI (owner go-ahead required)**

Ask the owner before pushing. Then:

Run: `git push -u origin main && gh run watch --exit-status`
Expected: both jobs green.

---

### Task 8: Production deployment and owner hand-off

**Files:**
- Create: `vercel.json`, `docs/setup.md`
- Modify: `README.md` (project summary, local dev quickstart, link to `docs/setup.md`)

**Interfaces:**
- Consumes: everything above. Neon's Vercel integration provides `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.

- [ ] **Step 1: Write `vercel.json`**

```json
{ "buildCommand": "pnpm db:migrate && pnpm build" }
```

Each preview deployment gets its own Neon branch (copied from production at branch time), so previews migrate their own copy and the owner's login works there too.

- [ ] **Step 2: Write `docs/setup.md`, the owner's checklist**

Plain-language numbered steps, each with what success looks like:
1. Sign up at vercel.com with GitHub. **Add New → Project**, import `ProfessorFess/Finnance`, but **don't deploy yet**.
2. In the project: **Storage → Create Database → Neon** (Vercel Marketplace). Connect it to all environments and turn on **creating a database branch for each preview deployment**.
3. In **Settings → Environment Variables**, add:
   - `BETTER_AUTH_SECRET`: the output of `openssl rand -base64 32`, a different value for Production and Preview;
   - `ALLOW_SIGNUP=false`, for all environments;
   - `BETTER_AUTH_URL`: `https://<project>.vercel.app`, Production only. Previews derive it from `VERCEL_URL`.
4. **Deploy** (Deployments → Redeploy, or push to `main`), then open `https://<project>.vercel.app/api/auth/ok`. It should show `{"ok":true}`.
5. In the repo folder, create your login:
   - run `vercel link`;
   - run `vercel env pull .env.production.local --environment=production`;
   - run `pnpm create-owner --env-file .env.production.local` and **type your own email and password**;
   - delete `.env.production.local` afterward.
6. On your phone, open the site, sign in, go to **Settings → Security**, turn on two-factor authentication, and save the backup codes somewhere safe (e.g. a password manager).
7. Install the app on your phone:
   - iPhone: Safari → Share → **Add to Home Screen**;
   - Android: Chrome menu → **Install app**.

- [ ] **Step 3: Owner checkpoint (stop and hand off)**

Tell the owner Phase 0 is ready to deploy and point them to `docs/setup.md` steps 1–5. Wait until they confirm the deployment URL.

- [ ] **Step 4: Verify the deployment**

Run: `curl -s https://<project>.vercel.app/api/auth/ok && curl -s -o /dev/null -w "%{http_code}\n" https://<project>.vercel.app/sign-in && curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<project>.vercel.app/goals`
Expected: `{"ok":true}`, then `200`, then a `307` redirect to `/sign-in?next=%2Fgoals`.

Run: `curl -s -X POST https://<project>.vercel.app/api/auth/sign-up/email -H 'content-type: application/json' -H 'origin: https://<project>.vercel.app' -d '{"name":"x","email":"probe@example.com","password":"probe-password-123"}' -w "\n%{http_code}\n"`
Expected: a non-2xx status (signup closed in production).

- [ ] **Step 5: Confirm the done criterion with the owner**

The owner completes steps 6–7 and confirms they signed in on their phone and see the app shell. That is Phase 0's "done when" (spec section 16).

- [ ] **Step 6: Commit and push (owner go-ahead)**

```bash
git add vercel.json docs/setup.md README.md
git commit -m "docs: add deployment config and owner setup checklist"
git push
```
