# Phase 1a: Getting Files In — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner sets a tracking start date and their 4 accounts with starting balances, uploads all four bank exports (UFCU and Ally) in one go, and sees every transaction since the start date: deduplicated, pending rows skipped, balances correct, with a Transactions page to search, filter, categorize, and add cash entries by hand.

**Architecture:**
- **Parsing:** pure, unit-tested modules under `src/server/import/` turn a file into normalized rows:
  - readers for CSV, XLSX, and OFX;
  - format detection with built-in presets for UFCU and Ally, plus a generic heuristic;
  - column mapping, then start-date filtering and dedupe hashing.
- **Domain services:** under `src/server/finance/` (settings, accounts, categories, transactions, activity log) and `src/server/import/service.ts`. Each takes `(db, userId, …)` and is tested on PGlite.
- **Pages:** Next.js Server Actions are thin adapters. They call `requireUser()`, validate with Zod, and call a service with `getDb()`.
- **Dedupe:** enforced by a unique index on `(account_id, dedupe_hash)` with `ON CONFLICT DO NOTHING`.

**Tech Stack:** existing Phase 0 stack, plus `papaparse` 5.7.x (+ `@types/papaparse`) and `read-excel-file` 9.3.x (`read-excel-file/node`). No AI in 1a.

**Spec:** `docs/superpowers/specs/2026-11-15-finnance-design.md`. This covers the 1a slice of Phase 1 (section 16): sections 6 (Core tables), 7.1, 7.5, and 10 (Accounts, Import, Transactions). Read section 13 too: the owner's accounts and clean-slate start.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md). `cacheComponents` is on. Signed-in pages already block via `export const instant = false` on `(app)/layout.tsx`.
- **Money:** integer cents, Drizzle `bigint("…", { mode: "number" })`. **Negative means money out, positive means money in.**
- **Dates:** calendar dates stored as Postgres `date` (Drizzle `mode: "string"`, `"YYYY-MM-DD"`). **Never parse a bank date with `new Date(...)`.**
- **Scoping:** every service function takes `userId` and filters by it. Every Server Action calls `requireUser()` first and passes `user.id`; it never accepts a userId from the client.
- **Undo:** every data change made through a service writes an `activity_log` row (actor `user` or `system`).
- **Real data stays out of the repo.** Fixtures are synthetic rows in the real formats (Task 4 specifies them). Never copy files from `~/finnance-samples` into the repo.
- **Upload size:** one file per Server Action call. `experimental.serverActions.bodySizeLimit: "4mb"` (Vercel's request cap is 4.5MB).
- **UI:** shadcn/ui and the Phase 0 tokens. Money uses `.num` and `formatCents`; money in uses the `text-positive` color, money out the default text color. No horizontal scroll at 375px.
- **Empty states point to the next action** (spec §15).
- **Out of scope:** pushing to GitHub (needs owner go-ahead at execution time), AI column detection, merchant normalization, and transfer detection. Those are 1b.

## Review Focus

1. **Re-importing overlapping files.** The same export uploaded twice, or a new month overlapping the last, must add **zero** duplicates, while two genuinely identical coffees on the same day both count. → Task 6: `re-importing the same file adds nothing` and `keeps identical same-day rows as separate transactions`.
2. **Pending rows.** UFCU marks unposted rows `Transaction type = Pending`. They must be skipped and counted, so the posted version imported later isn't a duplicate. → Task 5: `ufcu preset marks Pending rows`; Task 6: `skips pending rows and reports how many`.
3. **Date shifting.** `11/14/2026` must become `2026-11-14` regardless of server timezone (Vercel runs UTC; the owner is in Austin). → Task 2: `parses calendar dates without timezone shifts` (runs with `TZ=America/Chicago` and `TZ=UTC` both asserted by string equality).
4. **Malformed rows.** Blank lines, a non-numeric amount, an impossible date (`02/30/2026`), or a trailing summary line must be reported with their line numbers while every good row still imports. → Task 5: `reports bad rows by line and keeps the good ones`.
5. **Large exports.** The UFCU checking export has about 4,800 rows (~600KB) going back to 2023. A full-history upload must import only rows since the start date, in one batched insert, quickly. → Task 6: `imports a 5,000-row file in batches under 5 seconds`.

---

## File Structure

```
src/server/db/finance-schema.ts            settings, accounts, categories, transactions, import_profiles, import_batches, activity_log
src/server/db/schema.ts                    (modify) re-export finance-schema
src/server/db/types.ts                     (modify) add Executor type
src/server/finance/
  settings.ts (+test)                      getSettings, setTrackingStartDate
  accounts.ts (+test)                      account CRUD + balances
  categories.ts (+test)                    DEFAULT_CATEGORIES, ensureDefaultCategories, listCategories
  transactions.ts (+test)                  list/search/filter, manual create, edit, bulk categorize, delete, history
  activity.ts                              logActivity, listActivity
src/server/import/
  types.ts                                 DateFormat, ColumnMapping, ParsedRow, RowError, ParsedFile
  read-csv.ts (+test)                      readCsv
  read-xlsx.ts (+test)                     readXlsx
  read-ofx.ts (+test)                      readOfx
  presets.ts                               UFCU + Ally presets
  detect.ts (+test)                        headerSignature, detectMapping
  apply-mapping.ts (+test)                 applyMapping
  parse-file.ts (+test)                    parseImportFile (dispatch by extension)
  dedupe.ts (+test)                        assignOccurrences, dedupeHash
  service.ts (+test)                       previewImport, commitImport, undoImport, listImportBatches, suggestAccount
  __fixtures__/ufcu-checking.csv, ally-spending.csv, generic-bad.csv, sample.ofx, sample.xlsx
src/lib/money.ts (+test)                   parseAmountToCents, formatCents
src/lib/dates.ts (+test)                   parseDateValue, formatDisplayDate
src/lib/public-paths.ts (+test)            isPublicPath (proxy)
src/test/users.ts                          createTestUser
src/test/e2e-db-guard.ts (+test)           assertSafeE2EDatabase
src/app/(app)/accounts/{page.tsx,actions.ts}           + components/accounts/*
src/app/(app)/import/{page.tsx,actions.ts}             + components/import/*
src/app/(app)/transactions/{page.tsx,actions.ts}       + components/transactions/*
e2e/fixtures/{ufcu-checking.csv,ally-spending.csv}     copies of the synthetic fixtures
e2e/{accounts,import,transactions}.spec.ts
docs/conventions.md
```

---

### Task 1: Carry-over hardening from Phase 0 review

**Files:**
- Create: `src/lib/public-paths.ts`, `src/test/e2e-db-guard.ts`, `docs/conventions.md`
- Modify:
  - `src/proxy.ts`, `next.config.ts`, `src/server/auth/session.ts`, `src/server/auth/create-owner.ts`;
  - `e2e/env.ts`, `e2e/global-setup.ts`, `.github/workflows/ci.yml`, `e2e/shell.spec.ts`.
- Test: `src/lib/public-paths.test.ts`, `src/test/e2e-db-guard.test.ts`, `src/server/auth/create-owner.test.ts`, `e2e/shell.spec.ts`

**Interfaces:**
- Produces:
  - `isPublicPath(pathname: string): boolean`;
  - `assertSafeE2EDatabase(url: string): void` (throws);
  - `getSession` is wrapped in React `cache()` (same signature).

- [ ] **Step 1: Write the failing tests**

`src/lib/public-paths.test.ts`:
```ts
import { expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

it.each([
  ["/sign-in", true], ["/sign-in/", true], ["/api/auth/session", true], ["/api/auth", true],
  ["/manifest.webmanifest", true], ["/icons/icon-192.png", true], ["/icon.svg", true], ["/apple-icon.png", true],
  ["/sign-insights", false], ["/api/authz", false], ["/api/import", false], ["/", false], ["/goals", false],
])("isPublicPath(%j) -> %j", (path, expected) => {
  expect(isPublicPath(path)).toBe(expected);
});
```

`src/test/e2e-db-guard.test.ts`:
```ts
import { expect, it } from "vitest";
import { assertSafeE2EDatabase } from "./e2e-db-guard";

it("allows local databases and *_test databases", () => {
  expect(() => assertSafeE2EDatabase("postgres://u:p@localhost:5432/finnance_test")).not.toThrow();
  expect(() => assertSafeE2EDatabase("postgres://u:p@127.0.0.1:5432/finnance")).not.toThrow();
  expect(() => assertSafeE2EDatabase("postgres://u:p@db.example.com/app_test")).not.toThrow();
});

it("refuses a remote non-test database without echoing the URL", () => {
  const run = () => assertSafeE2EDatabase("postgres://u:secretpw@ep-x.neon.tech/neondb");
  expect(run).toThrow(/E2E_DATABASE_URL/);
  expect(run).not.toThrow(/secretpw/);
});
```

Add to `create-owner.test.ts`:
```ts
it("refuses passwords longer than 128 characters", async () => {
  await expect(createOwner(auth, { ...input, password: "x".repeat(129) })).rejects.toThrow(/at most 128/);
});
```

Add to `e2e/shell.spec.ts`:
```ts
test("sends security headers", async ({ request }) => {
  const res = await request.get("/sign-in");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/lib/public-paths.test.ts src/test/e2e-db-guard.test.ts src/server/auth/create-owner.test.ts`
Expected: FAIL (modules missing; 128-character test fails).

- [ ] **Step 3: Implement**
- **`isPublicPath`:** exact or `prefix/` matches for `/sign-in` and `/api/auth`; exact matches for `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/favicon.ico`; and the `/icons/` prefix.
- **`src/proxy.ts`:**
  - matcher becomes `["/((?!_next/static|_next/image).*)"]`;
  - the proxy returns `NextResponse.next()` when `isPublicPath(pathname)`;
  - comment: "Optimistic only. Every page, route handler, and Server Action must check the session itself."
- **`assertSafeE2EDatabase`:** allow if the host is `localhost` or `127.0.0.1`, or the db name ends in `_test`. Otherwise throw `Error("E2E_DATABASE_URL must point at a local or *_test database")`.
- **`e2e/env.ts`:** read `E2E_DATABASE_URL` (default `postgres://finnance:finnance@localhost:5432/finnance_test`) and expose it as `DATABASE_URL` for the server. `global-setup.ts` calls `assertSafeE2EDatabase` first. In CI, rename the env to `E2E_DATABASE_URL`.
- **`createOwner`:** `MAX_PASSWORD_LENGTH = 128`, error `Password must be at most 128 characters`. The CLI prompt validates 12–128.
- **`next.config.ts`:**
  - `async headers()` for `/:path*`: `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
  - plus `experimental.serverActions.bodySizeLimit: "4mb"`.
- **`session.ts`:** `export const getSession = cache(async () => …)` (React `cache`).
- **`docs/conventions.md`:** short bullets on the rules above (scoping, the proxy is optimistic, Server Action pattern, cents and dates, activity log), plus:
  - "Migrations: add first, remove later. A migration must not break the currently deployed code, because Vercel runs migrations before the new build goes live."
  - "Never change BETTER_AUTH_SECRET: TOTP secrets and backup codes are encrypted with it."

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test && pnpm typecheck && pnpm test:e2e e2e/shell.spec.ts e2e/auth.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: Phase 0 review carry-overs (headers, proxy paths, e2e db guard, password cap)"
```

---

### Task 2: Money and date primitives

**Files:**
- Create: `src/lib/money.ts`, `src/lib/dates.ts`
- Test: `src/lib/money.test.ts`, `src/lib/dates.test.ts`

**Interfaces:**
- Produces:
  - `parseAmountToCents(raw: string): number | null`;
  - `formatCents(cents: number, opts?: { sign?: "auto" | "always" }): string` (`"$1,234.56"`, `"-$16.40"`, `"+$10.00"` with `always`);
  - `type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "M/D/YYYY" | "DD/MM/YYYY"`;
  - `parseDateValue(raw: string, format: DateFormat): string | null`, returning `YYYY-MM-DD` and rejecting impossible dates;
  - `formatDisplayDate(iso: string): string` (`"Nov 14, 2026"`, computed without `Date` timezone conversion).

- [ ] **Step 1: Write the failing tests**

```ts
// money.test.ts
it.each([
  ["20.84", 2084], ["-16.40", -1640], ["0.01", 1], ["1,234.56", 123456], ["$5", 500], ["(12.00)", -1200],
  [" 2650.00 ", 265000], ["-0.5", -50], ["100", 10000],
])("parseAmountToCents(%j) -> %j", (raw, cents) => expect(parseAmountToCents(raw)).toBe(cents));
it.each(["", "N/A", "12.345", "1.2.3", "abc"])("rejects %j", (raw) => expect(parseAmountToCents(raw)).toBeNull());
it("formats cents", () => {
  expect(formatCents(123456)).toBe("$1,234.56");
  expect(formatCents(-1640)).toBe("-$16.40");
  expect(formatCents(1000, { sign: "always" })).toBe("+$10.00");
  expect(formatCents(0)).toBe("$0.00");
});

// dates.test.ts
it.each([
  ["2026-11-14", "YYYY-MM-DD", "2026-11-14"], ["11/14/2026", "MM/DD/YYYY", "2026-11-14"],
  ["1/5/2026", "M/D/YYYY", "2026-01-05"], ["14/11/2026", "DD/MM/YYYY", "2026-11-14"],
  ["02/29/2028", "MM/DD/YYYY", "2028-02-29"],
] as const)("parseDateValue(%j, %s) -> %s", (raw, fmt, iso) => expect(parseDateValue(raw, fmt)).toBe(iso));
it.each([["02/30/2026", "MM/DD/YYYY"], ["13/01/2026", "MM/DD/YYYY"], ["2026-11-14", "MM/DD/YYYY"], ["", "YYYY-MM-DD"]] as const)(
  "rejects %j as %s", (raw, fmt) => expect(parseDateValue(raw, fmt)).toBeNull());
it("parses calendar dates without timezone shifts", () => {
  for (const tz of ["America/Chicago", "UTC", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    expect(parseDateValue("11/14/2026", "MM/DD/YYYY")).toBe("2026-11-14");
    expect(formatDisplayDate("2026-11-14")).toBe("Nov 14, 2026");
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/lib/money.test.ts src/lib/dates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**
- Amounts are parsed by regex on the string (strip `$`, `,`, whitespace; parentheses mean negative; at most 2 decimal places), never through floats.
- Dates come from regex capture groups with a days-in-month check.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/lib`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add cents and calendar-date parsing primitives"
```

---

### Task 3: Finance schema, settings, and accounts

**Files:**
- Create: `src/server/db/finance-schema.ts`, `src/server/finance/{settings,accounts,activity}.ts`, `src/test/users.ts`, migration `drizzle/0001_*.sql` (generated)
- Modify: `src/server/db/schema.ts`, `src/server/db/types.ts`
- Test: `src/server/finance/settings.test.ts`, `src/server/finance/accounts.test.ts`

**Interfaces:**
- Consumes: `parseDateValue` (Task 2) to validate the start date.
- Produces:
  - **Tables** (all ids `text` primary key defaulting to `crypto.randomUUID()`; every table has `user_id` → `user.id` with `on delete cascade`, and `created_at`/`updated_at` timestamps):
    - `user_settings(user_id pk, tracking_start_date date null, timezone text default 'America/Chicago', week_start_day int default 1)`;
    - `accounts(id, user_id, name, type, institution null, last_four null, starting_balance_cents bigint default 0, include_in_net_worth bool default true, archived_at timestamp null)`;
    - `categories(id, user_id, name, group_name, kind, icon, color, parent_id null, sort_order int, archived_at null)`, unique `(user_id, name)`;
    - `transactions(id, user_id, account_id → accounts cascade, date date, amount_cents bigint, raw_description, merchant null, category_id → categories set null, notes null, tags text[] default '{}', source, import_batch_id null → import_batches set null, external_id null, dedupe_hash, status default 'cleared', bank_category null)`, with a **unique index `(account_id, dedupe_hash)`** and index `(user_id, date)`;
    - `import_profiles(id, user_id, name, header_signature, mapping jsonb, default_account_id null)`, unique `(user_id, header_signature)`;
    - `import_batches(id, user_id, account_id, file_name, imported_count, duplicate_count, pending_count, before_start_count, error_count, undone_at null)`;
    - `activity_log(id, user_id, actor, action, entity_type, entity_id, before jsonb null, after jsonb null, undone_at null)`, index `(user_id, entity_type, entity_id)`.
  - Enum strings (TS unions, stored as text):
    - `AccountType = "checking" | "savings" | "credit_card" | "cash" | "loan" | "investment" | "other"`;
    - `CategoryKind = "expense" | "income" | "transfer"`;
    - `TransactionSource = "csv" | "xlsx" | "ofx" | "manual" | "ai" | "sync"`.
  - `type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0]` in `db/types.ts`.
  - `createTestUser(db: Database, email?: string): Promise<{ id: string }>`: inserts a `user` row directly.
  - `logActivity(db: Executor, entry: { userId: string; actor: "user" | "system"; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }): Promise<void>`;
  - `listActivity(db: Executor, userId: string, entityType: string, entityId: string): Promise<ActivityEntry[]>` (newest first);
  - `getSettings(db, userId): Promise<{ trackingStartDate: string | null; timezone: string; weekStartDay: number }>` (upserts the default row);
  - `setTrackingStartDate(db, userId, date: string): Promise<void>` (validates `YYYY-MM-DD`, logs activity);
  - `type AccountInput = { name: string; type: AccountType; institution?: string | null; lastFour?: string | null; startingBalanceCents: number }`;
  - `createAccount(db, userId, input: AccountInput): Promise<Account>`, `updateAccount(db, userId, id, patch: Partial<AccountInput>): Promise<Account>`, `archiveAccount(db, userId, id): Promise<void>`;
  - `listAccounts(db, userId, opts?: { includeArchived?: boolean }): Promise<(Account & { balanceCents: number; lastImportAt: Date | null })[]>`: balance = starting balance + sum of the account's transactions.
  - `class NotFoundError extends Error`, thrown when an id doesn't belong to the user.

- [ ] **Step 1: Write the failing tests**

`settings.test.ts`:
```ts
it("creates default settings on first read", async () => {
  expect(await getSettings(t.db, userA)).toEqual({ trackingStartDate: null, timezone: "America/Chicago", weekStartDay: 1 });
});
it("stores the tracking start date", async () => {
  await setTrackingStartDate(t.db, userA, "2026-11-07");
  expect((await getSettings(t.db, userA)).trackingStartDate).toBe("2026-11-07");
});
it.each(["11/07/2026", "2026-02-30", ""])("rejects invalid start date %j", async (d) => {
  await expect(setTrackingStartDate(t.db, userA, d)).rejects.toThrow(/date/i);
});
it("isolates users", async () => {
  await setTrackingStartDate(t.db, userA, "2026-11-07");
  expect((await getSettings(t.db, userB)).trackingStartDate).toBeNull();
});
```

`accounts.test.ts`:
```ts
const checking = { name: "UFCU Checking", type: "checking" as const, institution: "UFCU", startingBalanceCents: 152_034 };

it("creates an account and reports its starting balance as the balance", async () => {
  const a = await createAccount(t.db, userA, checking);
  const [listed] = await listAccounts(t.db, userA);
  expect(listed).toMatchObject({ id: a.id, name: "UFCU Checking", balanceCents: 152_034, lastImportAt: null });
});
it("adds transactions to the balance", async () => {
  const a = await createAccount(t.db, userA, checking);
  await insertTestTransaction(t.db, userA, a.id, { amountCents: -2_164 });
  await insertTestTransaction(t.db, userA, a.id, { amountCents: 120_000 });
  expect((await listAccounts(t.db, userA))[0]!.balanceCents).toBe(152_034 - 2_164 + 120_000);
});
it("rejects an empty name and a non-4-digit lastFour", async () => {
  await expect(createAccount(t.db, userA, { ...checking, name: " " })).rejects.toThrow(/name/i);
  await expect(createAccount(t.db, userA, { ...checking, lastFour: "12a4" })).rejects.toThrow(/last four/i);
});
it("hides archived accounts by default", async () => {
  const a = await createAccount(t.db, userA, checking);
  await archiveAccount(t.db, userA, a.id);
  expect(await listAccounts(t.db, userA)).toHaveLength(0);
  expect(await listAccounts(t.db, userA, { includeArchived: true })).toHaveLength(1);
});
it("records account changes in the activity log", async () => {
  const a = await createAccount(t.db, userA, checking);
  await updateAccount(t.db, userA, a.id, { name: "Checking" });
  const log = await listActivity(t.db, userA, "account", a.id);
  expect(log.map((e) => e.action)).toEqual(["account.update", "account.create"]);
});
it("isolates users", async () => {
  const a = await createAccount(t.db, userA, checking);
  expect(await listAccounts(t.db, userB)).toHaveLength(0);
  await expect(updateAccount(t.db, userB, a.id, { name: "x" })).rejects.toThrow(NotFoundError);
  await expect(archiveAccount(t.db, userB, a.id)).rejects.toThrow(NotFoundError);
});
```

`userA`/`userB` come from `createTestUser` in `beforeEach`. `insertTestTransaction(db, userId, accountId, { amountCents, date?, description? })` lives in `src/test/users.ts` too. It's a direct insert with a random `dedupe_hash` and `source: "manual"`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/finance`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the schema, generate the migration, implement the services**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `drizzle/0001_*.sql` creates the 7 tables, applied locally.

The migration only adds tables (add-first rule). Compute balances with one grouped `sum(amount_cents)` query per call, not per account.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add finance schema with settings, accounts, and activity log"
```

---

### Task 4: File readers (CSV, XLSX, OFX) and fixtures

**Files:**
- Create: `src/server/import/{types,read-csv,read-xlsx,read-ofx}.ts`, `src/server/import/__fixtures__/*`
- Test: `src/server/import/readers.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type AmountMapping =
  | { kind: "signed"; column: string; invert?: boolean }
  | { kind: "indicator"; column: string; indicatorColumn: string; debitValues: string[] }
  | { kind: "split"; debitColumn: string; creditColumn: string };
export type ColumnMapping = {
  date: { column: string; format: DateFormat };
  description: string;
  amount: AmountMapping;
  pending?: { column: string; values: string[] };
  bankCategory?: string;
  accountNumber?: string;
};
export type ParsedRow = {
  line: number; date: string; amountCents: number; description: string;
  pending: boolean; bankCategory: string | null; accountNumber: string | null; externalId: string | null;
};
export type RowError = { line: number; reason: string };
export type Table = { headers: string[]; rows: string[][]; lines: number[] }; // lines[i] = original 1-based file line where rows[i] starts
```
- Readers:
  - `readCsv(text: string): Table` (strips the BOM, trims headers, skips fully empty rows, keeps quoted multi-line fields);
  - `readXlsx(bytes: Uint8Array): Promise<Table>` (first sheet; date cells become `YYYY-MM-DD` strings, numbers become plain decimal strings);
  - `readOfx(text: string): { accountId: string | null; rows: ParsedRow[]; errors: RowError[] }` (SGML or XML OFX; one row per `<STMTTRN>`; `TRNAMT` gives cents, `DTPOSTED` the first 8 digits as the date, `NAME`, then `MEMO`, as the description; `FITID` is the `externalId`).

**Fixtures** (synthetic; the exact bytes matter):

- `ufcu-checking.csv`: UTF-8 **with BOM**, LF line endings. Header (exactly the real UFCU export's 17 columns):
  `Account number(BBAN),Account name,Counter party account number,Counter party name,Currency,Amount,Credit/debit indicator,Book date,Transaction type,Transaction group,Transaction reference,Instructed currency,currency exchange rate,Instructed amount,Description,Category,Check number`

  Rows, each `1800000001234,FREE CHECKING,,,USD,<amount>,<Debit|Credit>,<date>,<type>,<group>,,USD,,0.00,<description>,<category>,` (the trailing empty field is `Check number`):

  | # | amount | ind | date | type | group | description | category |
  |---|---|---|---|---|---|---|---|
  | 1 | 20.84 | Debit | 11/15/2026 | Pending | Withdrawal | Uber Eats | Food & Dining |
  | 2 | 21.64 | Debit | 11/14/2026 | Credit / Debit Card | Withdrawal | Prime Video | Bills & Utilities |
  | 3 | 1200.00 | Credit | 11/14/2026 | ACH | Deposit | Payroll Acme Corp | Income |
  | 4 | 6.25 | Debit | 11/13/2026 | POS | Withdrawal | Bennu Coffee | Food & Dining |
  | 5 | 6.25 | Debit | 11/13/2026 | POS | Withdrawal | Bennu Coffee | Food & Dining |
  | 6 | 100.00 | Debit | 11/12/2026 | Home Banking | Withdrawal | `"Withdrawal Internet Banking Transfer To Share 0001⏎Savings"` (quoted, contains a real newline) | Transfer |
  | 7 | 45.10 | Debit | 11/02/2026 | Credit / Debit Card | Withdrawal | HEB | Groceries |

- `ally-spending.csv`: no BOM. Header `Date, Time, Amount, Type, Description` (spaces after the commas, as Ally does). Rows:
  - `2026-11-13,23:39:12,0.01,Deposit,Interest Paid`
  - `2026-11-09,14:32:39,-16.40,Withdrawal,"CORNER STORE 101 MAIN ST AUSTIN, TX, US"`
  - `2026-11-08,19:14:46,10.00,Deposit,Zelle payment from A SAMPLE to A Sample (Ally Spending Account XXXXXX0000)`
  - `2026-11-01,09:00:00,-5.00,Withdrawal,EARLY ROW BEFORE START`
- `generic-bad.csv`: header `Date,Description,Amount`. Rows:
  - `2026-11-10,Good One,-12.00`
  - (empty line)
  - `2026-11-11,Bad Amount,N/A`
  - `2026-02-30,Bad Date,-3.00`
  - `2026-11-12,Good Two,4.50`
  - `Total,,-7.50`
- `sample.ofx`: SGML OFX with `<ACCTID>0000999` and two `<STMTTRN>` blocks:
  - FITID `A1`, DTPOSTED `20261110120000[-6:CST]`, TRNAMT `-12.34`, NAME `TEST MERCHANT`;
  - FITID `A2`, DTPOSTED `20261111`, TRNAMT `200.00`, NAME `TEST DEPOSIT`.
- `sample.xlsx`: generated by `scripts/make-xlsx-fixture.ts` (`pnpm add -D write-excel-file`, run once with `pnpm tsx scripts/make-xlsx-fixture.ts`, commit both the script and the binary). Header `Date | Description | Amount`; rows `2026-11-10` (a real date cell) `| XLSX Coffee | -4.75` and `2026-11-11` (date cell) `| XLSX Refund | 10` (number cell).

- [ ] **Step 1: Write the failing test** `readers.test.ts`

```ts
it("reads the UFCU export: BOM stripped, 17 headers, multi-line description kept", () => {
  const t = readCsv(fixture("ufcu-checking.csv"));
  expect(t.headers[0]).toBe("Account number(BBAN)");
  expect(t.headers).toHaveLength(17);
  expect(t.rows).toHaveLength(7);
  expect(t.rows[5]![14]).toBe("Withdrawal Internet Banking Transfer To Share 0001\nSavings");
  expect(t.lines).toEqual([2, 3, 4, 5, 6, 7, 9]);
});
it("reads the Ally export with trimmed headers", () => {
  expect(readCsv(fixture("ally-spending.csv")).headers).toEqual(["Date", "Time", "Amount", "Type", "Description"]);
});
it("skips blank lines but keeps original line numbers", () => {
  const t = readCsv(fixture("generic-bad.csv"));
  expect(t.rows).toHaveLength(5);
  expect(t.lines).toEqual([2, 4, 5, 6, 7]);
});
it("reads XLSX dates as calendar dates", async () => {
  const t = await readXlsx(fixtureBytes("sample.xlsx"));
  expect(t.headers).toEqual(["Date", "Description", "Amount"]);
  expect(t.rows[0]).toEqual(["2026-11-10", "XLSX Coffee", "-4.75"]);
});
it("reads OFX transactions with FITIDs", () => {
  const r = readOfx(fixture("sample.ofx"));
  expect(r.accountId).toBe("0000999");
  expect(r.rows).toEqual([
    expect.objectContaining({ date: "2026-11-10", amountCents: -1234, description: "TEST MERCHANT", externalId: "A1" }),
    expect.objectContaining({ date: "2026-11-11", amountCents: 20000, description: "TEST DEPOSIT", externalId: "A2" }),
  ]);
});
```

`fixture(name)` and `fixtureBytes(name)` read from `__fixtures__` with `node:fs`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm add papaparse@^5.7.1 read-excel-file@^9.3.17 && pnpm add -D @types/papaparse && pnpm test src/server/import/readers.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the readers.** `readCsv`: papaparse with a `step` callback; each row's starting line is 1 + the number of newlines in the raw text before that row's start (track the previous row's `meta.cursor`, then skip leading newlines); drop rows whose fields are all empty. `readXlsx`: `read-excel-file/node`; `Date` cells → `YYYY-MM-DD` from their UTC parts.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add CSV, XLSX, and OFX readers with synthetic bank fixtures"
```

---

### Task 5: Format detection and mapping

**Files:**
- Create: `src/server/import/{presets,detect,apply-mapping,parse-file}.ts`
- Test: `src/server/import/detect.test.ts`, `src/server/import/apply-mapping.test.ts`, `src/server/import/parse-file.test.ts`

**Interfaces:**
- Consumes: Task 2 primitives and Task 4 readers and types.
- Produces:
  - `headerSignature(headers: string[]): string` (lowercased, trimmed, joined with `|`);
  - `PRESETS: Record<"ufcu" | "ally", { label: string; institution: string; signature: string; mapping: ColumnMapping }>`:
    - **ufcu:** label `"UFCU export"`; date `Book date` `MM/DD/YYYY`; description `Description`; amount `indicator` on `Amount` / `Credit/debit indicator` with debit value `["Debit"]`; pending `{ column: "Transaction type", values: ["Pending"] }`; bankCategory `Category`; accountNumber `Account number(BBAN)`;
    - **ally:** label `"Ally export"`; date `Date` `YYYY-MM-DD`; description `Description`; amount `signed` on `Amount`.
  - `detectMapping(table: Table): { preset: "ufcu" | "ally" | null; mapping: ColumnMapping | null; confidence: "high" | "low" }`:
    - a preset signature match gives `high`;
    - otherwise the heuristic: a date column (header contains `date`; format inferred from the first 20 values), a description column (header matches `description|memo|payee|name|merchant|details`), and an amount (`amount` column, with an indicator column whose values are only debit/credit; or a debit+credit pair). The heuristic always gives `low`;
    - `null` mapping when no date or amount is found.
  - `applyMapping(table: Table, mapping: ColumnMapping): { rows: ParsedRow[]; errors: RowError[] }`:
    - whitespace in descriptions collapses to single spaces;
    - a row with a bad date or amount becomes an error (`reason` names the column);
    - `line` is the 1-based file line number.
  - `type SavedProfile = { id: string; headerSignature: string; mapping: ColumnMapping }`
  - `parseImportFile(file: { name: string; bytes: Uint8Array }, profiles: SavedProfile[]): Promise<ParsedFile>`, where:
```ts
export type ParsedFile = {
  source: "csv" | "xlsx" | "ofx";
  format: { kind: "preset"; id: "ufcu" | "ally"; label: string } | { kind: "profile"; id: string }
        | { kind: "detected"; confidence: "high" | "low" } | { kind: "ofx" } | { kind: "unknown" };
  table: Table | null; mapping: ColumnMapping | null; accountHint: string | null;
  rows: ParsedRow[]; errors: RowError[];
};
```
    - Precedence: preset, then a saved profile with the same signature, then the heuristic.
    - Rows are produced only when the mapping is preset, profile, or high-confidence. `low` and `unknown` return `rows: []` so the UI asks for mapping.
    - `accountHint` is the account-number column's value or the OFX `ACCTID`.
    - Unsupported extensions throw `ImportError("Unsupported file type: use CSV, XLSX, or OFX")`.

- [ ] **Step 1: Write the failing tests**

```ts
// detect.test.ts
it("recognizes UFCU and Ally exports by header", () => {
  expect(detectMapping(readCsv(fixture("ufcu-checking.csv")))).toMatchObject({ preset: "ufcu", confidence: "high" });
  expect(detectMapping(readCsv(fixture("ally-spending.csv")))).toMatchObject({ preset: "ally", confidence: "high" });
});
it("guesses a generic layout with low confidence", () => {
  const d = detectMapping(readCsv(fixture("generic-bad.csv")));
  expect(d).toMatchObject({ preset: null, confidence: "low" });
  expect(d.mapping).toEqual({ date: { column: "Date", format: "YYYY-MM-DD" }, description: "Description", amount: { kind: "signed", column: "Amount" } });
});
it("detects debit/credit column pairs", () => {
  const d = detectMapping({ headers: ["Posted Date", "Payee", "Debit", "Credit"], rows: [["11/10/2026", "X", "5.00", ""]], lines: [2] });
  expect(d.mapping?.amount).toEqual({ kind: "split", debitColumn: "Debit", creditColumn: "Credit" });
  expect(d.mapping?.date.format).toBe("MM/DD/YYYY");
});
it("gives up without a date column", () => {
  expect(detectMapping({ headers: ["Foo", "Bar"], rows: [["a", "b"]], lines: [2] }).mapping).toBeNull();
});

// apply-mapping.test.ts
it("ufcu preset signs amounts by indicator and marks Pending rows", () => {
  const { rows, errors } = applyMapping(readCsv(fixture("ufcu-checking.csv")), PRESETS.ufcu.mapping);
  expect(errors).toEqual([]);
  expect(rows.map((r) => [r.date, r.amountCents, r.pending])).toEqual([
    ["2026-11-15", -2084, true], ["2026-11-14", -2164, false], ["2026-11-14", 120000, false],
    ["2026-11-13", -625, false], ["2026-11-13", -625, false], ["2026-11-12", -10000, false], ["2026-11-02", -4510, false],
  ]);
  expect(rows[5]!.description).toBe("Withdrawal Internet Banking Transfer To Share 0001 Savings");
  expect(rows[1]).toMatchObject({ bankCategory: "Bills & Utilities", accountNumber: "1800000001234" });
});
it("ally preset keeps signed amounts", () => {
  const { rows } = applyMapping(readCsv(fixture("ally-spending.csv")), PRESETS.ally.mapping);
  expect(rows.map((r) => r.amountCents)).toEqual([1, -1640, 1000, -500]);
});
it("reports bad rows by line and keeps the good ones", () => {
  const table = readCsv(fixture("generic-bad.csv"));
  const { rows, errors } = applyMapping(table, detectMapping(table).mapping!);
  expect(rows.map((r) => r.description)).toEqual(["Good One", "Good Two"]);
  expect(errors).toEqual([
    { line: 4, reason: expect.stringMatching(/Amount/) },
    { line: 5, reason: expect.stringMatching(/Date/) },
    { line: 7, reason: expect.stringMatching(/Date/) },
  ]);
});

// parse-file.test.ts
it("parses a UFCU file end to end with an account hint", async () => {
  const p = await parseImportFile({ name: "UFCU_Checking_Account.csv", bytes: fixtureBytes("ufcu-checking.csv") }, []);
  expect(p).toMatchObject({ source: "csv", format: { kind: "preset", id: "ufcu" }, accountHint: "1800000001234" });
  expect(p.rows).toHaveLength(7);
});
it("uses a saved profile for an unknown layout", async () => {
  const table = readCsv(fixture("generic-bad.csv"));
  const profile = { id: "p1", headerSignature: headerSignature(table.headers), mapping: detectMapping(table).mapping! };
  const p = await parseImportFile({ name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") }, [profile]);
  expect(p.format).toEqual({ kind: "profile", id: "p1" });
  expect(p.rows).toHaveLength(2);
});
it("asks for mapping on a low-confidence guess", async () => {
  const p = await parseImportFile({ name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") }, []);
  expect(p.format).toEqual({ kind: "detected", confidence: "low" });
  expect(p.rows).toEqual([]);
  expect(p.mapping).not.toBeNull();
});
it("rejects unsupported files", async () => {
  await expect(parseImportFile({ name: "statement.pdf", bytes: new Uint8Array() }, [])).rejects.toThrow(/CSV, XLSX, or OFX/);
});
```

Line numbers in `generic-bad.csv`: header=1, `Good One`=2, blank=3, `Bad Amount`=4, `Bad Date`=5, `Good Two`=6, `Total`=7. `applyMapping` reports `table.lines[i]`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/import`
Expected: new tests FAIL.

- [ ] **Step 3: Implement** `presets.ts`, `detect.ts`, `apply-mapping.ts`, `parse-file.ts`

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test src/server/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: detect UFCU/Ally formats and map bank columns to transactions"
```

---

### Task 6: Import service: preview, commit, undo

**Files:**
- Create: `src/server/import/{dedupe,service}.ts`
- Test: `src/server/import/dedupe.test.ts`, `src/server/import/service.test.ts`

**Interfaces:**
- Consumes: `parseImportFile`, `getSettings`, `listAccounts`, `logActivity`, `createTestUser`, and the fixtures.
- Produces:
  - `assignOccurrences(rows: ParsedRow[]): (ParsedRow & { occurrence: number })[]`: the n-th identical `(date, amountCents, description)` row gets occurrence n−1, in file order;
  - `dedupeHash(accountId: string, row: ParsedRow, occurrence: number): string`: `ext:<externalId>` when present, otherwise the sha256 hex of `accountId|date|amountCents|lowercased description|occurrence`;
  - `class ImportError extends Error` (user-facing messages);
```ts
export type ImportCounts = { rows: number; pending: number; beforeStart: number; errors: number; ready: number };
export type ImportPreview = {
  fileName: string; formatLabel: string; needsMapping: boolean; headers: string[];
  mapping: ColumnMapping | null; suggestedAccountId: string | null;
  counts: ImportCounts; sample: ParsedRow[]; errors: RowError[];
};
export type ImportResult = { batchId: string; imported: number; duplicates: number; pending: number; beforeStart: number; errors: RowError[] };
```
  - `previewImport(db, userId, file: { name: string; bytes: Uint8Array }, mapping?: ColumnMapping): Promise<ImportPreview>`:
    - `sample` is the first 5 ready rows; `errors` is capped at 20;
    - `formatLabel` is the preset label, `"Saved format"`, `"OFX file"`, or `"Unrecognized layout"`.
  - `commitImport(db, userId, input: { file: { name: string; bytes: Uint8Array }; accountId: string; mapping?: ColumnMapping }): Promise<ImportResult>`:
    - the ready rows are those with `date >= trackingStartDate`, not pending, and not errored;
    - insert in chunks of 500 with `onConflictDoNothing({ target: [transactions.accountId, transactions.dedupeHash] }).returning({ id })`;
    - `duplicates = ready − inserted`;
    - all writes happen in one DB transaction: the batch row, the inserts, an upsert of the `import_profiles` row (only when an explicit `mapping` was passed, keyed by header signature), learning `last_four` (when the account has none and `accountHint` is 4+ digits, set it to the hint's last 4), and one `activity_log` row (`import.commit`).
  - `undoImport(db, userId, batchId: string): Promise<{ removed: number }>`: deletes that batch's transactions, sets `undone_at`, and logs `import.undo`. Undoing twice throws `ImportError("Already undone")`.
  - `listImportBatches(db, userId, limit = 10)`: newest first, including `undoneAt` and the account name.
  - `suggestAccount(accounts: { id: string; name: string; lastFour: string | null; institution: string | null }[], parsed: { accountHint: string | null; format: ParsedFile["format"] }, fileName: string): string | null`:
    1. an account whose `lastFour` equals the hint's last 4;
    2. else, among accounts whose institution matches the preset's institution (`UFCU`, `Ally`, case-insensitive), the one whose name shares a word with the file name (`checking|savings|spending`, where `spending` also matches type `checking`);
    3. else the only account of that institution;
    4. else `null`.
  - Errors:
    - `commitImport` and `previewImport` throw `ImportError("Set your tracking start date first")` when it's unset;
    - `commitImport` throws `NotFoundError` for an account of another user;
    - `commitImport` throws `ImportError("Choose how to read this file's columns")` when parsing needs a mapping and none was passed.

- [ ] **Step 1: Write the failing tests**

```ts
// dedupe.test.ts
it("numbers identical rows in file order", () => {
  const r = (d: string) => ({ line: 0, date: "2026-11-13", amountCents: -625, description: d, pending: false, bankCategory: null, accountNumber: null, externalId: null });
  expect(assignOccurrences([r("Bennu Coffee"), r("Other"), r("Bennu Coffee")]).map((x) => x.occurrence)).toEqual([0, 0, 1]);
});
it("hashes by external id when present", () => {
  expect(dedupeHash("acc", { ...base, externalId: "A1" }, 0)).toBe("ext:A1");
});

// service.test.ts. beforeEach: createTestUser A and B; setTrackingStartDate(A, "2026-11-07");
// checking = createAccount(A, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 100_000 })
// spending = createAccount(A, { name: "Ally Spending", type: "checking", institution: "Ally", startingBalanceCents: 0 })
// allySavings = createAccount(A, { name: "Ally Savings", type: "savings", institution: "Ally", startingBalanceCents: 0 })
const ufcu = () => ({ name: "UFCU_Checking_Account.csv", bytes: fixtureBytes("ufcu-checking.csv") });
const ally = () => ({ name: "ALLY_Spending_Account.csv", bytes: fixtureBytes("ally-spending.csv") });

it("previews counts and suggests the account", async () => {
  const p = await previewImport(t.db, A, ufcu());
  expect(p).toMatchObject({ formatLabel: "UFCU export", needsMapping: false, suggestedAccountId: checking.id }); // rule 3: only UFCU account
  expect(p.counts).toEqual({ rows: 7, pending: 1, beforeStart: 1, errors: 0, ready: 5 });
});
it("skips pending rows and rows before the start date, and reports how many", async () => {
  const r = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect(r).toMatchObject({ imported: 5, duplicates: 0, pending: 1, beforeStart: 1, errors: [] });
  const [acc] = (await listAccounts(t.db, A)).filter((a) => a.id === checking.id);
  expect(acc!.balanceCents).toBe(100_000 - 2_164 + 120_000 - 625 - 625 - 10_000);
});
it("keeps identical same-day rows as separate transactions", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  const rows = await t.db.select().from(transactions).where(eq(transactions.rawDescription, "Bennu Coffee"));
  expect(rows).toHaveLength(2);
});
it("re-importing the same file adds nothing", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect(await commitImport(t.db, A, { file: ufcu(), accountId: checking.id })).toMatchObject({ imported: 0, duplicates: 5 });
});
it("learns the account's last four from a UFCU file, then suggests it", async () => {
  await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  expect((await listAccounts(t.db, A)).find((a) => a.id === checking.id)!.lastFour).toBe("1234");
  expect((await previewImport(t.db, A, ufcu())).suggestedAccountId).toBe(checking.id);
});
it("suggests the Ally account by file name", async () => {
  expect((await previewImport(t.db, A, ally())).suggestedAccountId).toBe(spending.id);
});
it("undo removes the batch's transactions once", async () => {
  const r = await commitImport(t.db, A, { file: ally(), accountId: spending.id });
  expect(await undoImport(t.db, A, r.batchId)).toEqual({ removed: 3 });
  await expect(undoImport(t.db, A, r.batchId)).rejects.toThrow(/Already undone/);
});
it("saves a confirmed mapping as a profile for next time", async () => {
  const file = { name: "bank.csv", bytes: fixtureBytes("generic-bad.csv") };
  const p = await previewImport(t.db, A, file);
  expect(p.needsMapping).toBe(true);
  await commitImport(t.db, A, { file, accountId: checking.id, mapping: p.mapping! });
  expect((await previewImport(t.db, A, file)).formatLabel).toBe("Saved format");
});
it("requires a tracking start date", async () => {
  await expect(previewImport(t.db, B, ufcu())).rejects.toThrow(/start date/);
});
it("isolates users", async () => {
  await setTrackingStartDate(t.db, B, "2026-11-07");
  await expect(commitImport(t.db, B, { file: ufcu(), accountId: checking.id })).rejects.toThrow(NotFoundError);
  const r = await commitImport(t.db, A, { file: ufcu(), accountId: checking.id });
  await expect(undoImport(t.db, B, r.batchId)).rejects.toThrow(NotFoundError);
});
it("imports a 5,000-row file in batches under 5 seconds", async () => {
  const lines = ["Date, Time, Amount, Type, Description"];
  for (let i = 0; i < 5000; i++) lines.push(`2026-11-${String(8 + (i % 20)).padStart(2, "0")},12:00:00,-1.${String(i % 100).padStart(2, "0")},Withdrawal,Row ${i}`);
  const started = performance.now();
  const r = await commitImport(t.db, A, { file: { name: "ally_spending.csv", bytes: new TextEncoder().encode(lines.join("\n")) }, accountId: spending.id });
  expect(r.imported).toBe(5000);
  expect(performance.now() - started).toBeLessThan(5000);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/import`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** (`node:crypto` `createHash("sha256")`)

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: import service with start-date filter, pending skip, dedupe, and undo"
```

---

### Task 7: Categories and transactions services

**Files:**
- Create: `src/server/finance/{categories,transactions}.ts`
- Test: `src/server/finance/categories.test.ts`, `src/server/finance/transactions.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_CATEGORIES: { name: string; group: string; kind: CategoryKind; icon: string }[]`, exactly, in this order:
    - **Income** (income): Paycheck, Interest, Refunds, Other income
    - **Essentials** (expense): Rent & housing, Utilities, Phone, Groceries, Gas & fuel, Insurance, Health, Personal care
    - **Lifestyle** (expense): Coffee, Restaurants, Bars, Shopping, Entertainment, Subscriptions, Travel, Rideshare & transit, Gifts
    - **Savings** (transfer): Savings, Investing
    - **Transfers** (transfer): Transfer, Credit card payment
    - **Other** (expense): Fees, Cash, Other

    `icon` is a lucide icon name chosen by the builder.
  - `ensureDefaultCategories(db, userId): Promise<void>`: idempotent; inserts only missing names.
  - `listCategories(db, userId): Promise<Category[]>`: calls `ensureDefaultCategories` first; ordered by group order above, then `sort_order`.
```ts
export type TransactionFilters = { search?: string; accountId?: string; categoryId?: string | "uncategorized"; from?: string; to?: string; cursor?: string; limit?: number };
export type TransactionRow = { id: string; date: string; amountCents: number; description: string; accountId: string; accountName: string;
  categoryId: string | null; categoryName: string | null; notes: string | null; source: TransactionSource; status: string };
```
  - `listTransactions(db, userId, f: TransactionFilters): Promise<{ items: TransactionRow[]; nextCursor: string | null }>`:
    - sorted by `date desc, created_at desc, id desc`;
    - `limit` defaults to 100 (max 200);
    - search is a case-insensitive `ILIKE` on `raw_description` and `notes`, with `%` and `_` escaped;
    - the cursor is opaque (base64 JSON of the last row's sort keys).
  - `createManualTransaction(db, userId, input: { accountId: string; date: string; description: string; amountCents: number; categoryId?: string | null; notes?: string | null }): Promise<TransactionRow>`: `source: "manual"`, `dedupe_hash: "manual:" + uuid`, logs `transaction.create`.
  - `updateTransaction(db, userId, id, patch: { categoryId?: string | null; notes?: string | null; description?: string; date?: string; amountCents?: number }): Promise<TransactionRow>`: `date` and `amountCents` are allowed only on `manual` rows (otherwise `Error("Imported amounts and dates can't be edited")`); logs `transaction.update` with before and after.
  - `setCategoryBulk(db, userId, ids: string[], categoryId: string | null): Promise<number>`: ignores ids that aren't the user's; logs one `transaction.bulk_categorize` entry per changed row.
  - `deleteTransaction(db, userId, id): Promise<void>`: only `manual` rows; imported rows are removed by undoing their import. Logs `transaction.delete`.
  - `getTransactionHistory(db, userId, id): Promise<ActivityEntry[]>`.
  - A `categoryId` belonging to another user is treated as `NotFoundError` everywhere.

- [ ] **Step 1: Write the failing tests**

```ts
// categories.test.ts
it("seeds the default categories once", async () => {
  await ensureDefaultCategories(t.db, A);
  await ensureDefaultCategories(t.db, A);
  const cats = await listCategories(t.db, A);
  expect(cats).toHaveLength(DEFAULT_CATEGORIES.length);
  expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining(["Coffee", "Restaurants", "Bars", "Shopping", "Transfer"]));
  expect(cats.find((c) => c.name === "Savings")!.kind).toBe("transfer");
});
it("isolates users", async () => {
  await listCategories(t.db, A);
  expect((await listCategories(t.db, B)).every((c) => c.userId === B)).toBe(true);
});

// transactions.test.ts. beforeEach: user A with start date, account `checking`, the UFCU fixture imported (5 rows)
it("lists newest first with account names", async () => {
  const { items } = await listTransactions(t.db, A, {});
  expect(items.map((i) => i.date)).toEqual(["2026-11-14", "2026-11-14", "2026-11-13", "2026-11-13", "2026-11-12"]);
  expect(items[0]!.accountName).toBe("UFCU Checking");
});
it("searches descriptions case-insensitively and literally", async () => {
  expect((await listTransactions(t.db, A, { search: "bennu" })).items).toHaveLength(2);
  expect((await listTransactions(t.db, A, { search: "%" })).items).toHaveLength(0);
});
it("filters by date range, account, and uncategorized", async () => {
  expect((await listTransactions(t.db, A, { from: "2026-11-13", to: "2026-11-13" })).items).toHaveLength(2);
  expect((await listTransactions(t.db, A, { categoryId: "uncategorized" })).items).toHaveLength(5);
});
it("paginates with a cursor", async () => {
  const first = await listTransactions(t.db, A, { limit: 2 });
  const second = await listTransactions(t.db, A, { limit: 2, cursor: first.nextCursor! });
  const third = await listTransactions(t.db, A, { limit: 2, cursor: second.nextCursor! });
  expect([...first.items, ...second.items, ...third.items].map((i) => i.id)).toHaveLength(5);
  expect(third.nextCursor).toBeNull();
});
it("adds a manual cash transaction and records it", async () => {
  const tx = await createManualTransaction(t.db, A, { accountId: checking.id, date: "2026-11-14", description: "Farmers market", amountCents: -1_800 });
  expect(tx.source).toBe("manual");
  expect((await getTransactionHistory(t.db, A, tx.id)).map((e) => e.action)).toEqual(["transaction.create"]);
});
it("categorizes in bulk and logs each change", async () => {
  const coffee = (await listCategories(t.db, A)).find((c) => c.name === "Coffee")!;
  const ids = (await listTransactions(t.db, A, { search: "Bennu" })).items.map((i) => i.id);
  expect(await setCategoryBulk(t.db, A, ids, coffee.id)).toBe(2);
  expect((await getTransactionHistory(t.db, A, ids[0]!))[0]!.action).toBe("transaction.bulk_categorize");
});
it("won't edit an imported amount or delete an imported row", async () => {
  const [imported] = (await listTransactions(t.db, A, {})).items;
  await expect(updateTransaction(t.db, A, imported!.id, { amountCents: 1 })).rejects.toThrow(/can't be edited/);
  await expect(deleteTransaction(t.db, A, imported!.id)).rejects.toThrow(/undo the import/i);
});
it("isolates users", async () => {
  const [row] = (await listTransactions(t.db, A, {})).items;
  expect((await listTransactions(t.db, B, {})).items).toHaveLength(0);
  await expect(updateTransaction(t.db, B, row!.id, { notes: "x" })).rejects.toThrow(NotFoundError);
  const bCat = (await listCategories(t.db, B))[0]!;
  await expect(updateTransaction(t.db, A, row!.id, { categoryId: bCat.id })).rejects.toThrow(NotFoundError);
  expect(await setCategoryBulk(t.db, B, [row!.id], bCat.id)).toBe(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test src/server/finance`
Expected: FAIL.

- [ ] **Step 3: Implement**

The delete error copy is exactly `Imported transactions can't be deleted. Undo the import instead.`

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add default categories and transaction services"
```

---

### Task 8: Accounts page and tracking start date

**Files:**
- Create: `src/app/(app)/accounts/actions.ts`, `src/components/accounts/{start-date-card,account-list,account-dialog}.tsx`
- Modify: `src/app/(app)/accounts/page.tsx`, `e2e/global-setup.ts`, `e2e/fixtures.ts`, `e2e/shell.spec.ts`
- Test: `e2e/accounts.spec.ts`

**Interfaces:**
- Consumes: settings and accounts services; `requireUser`; `formatCents`, `formatDisplayDate`.
- Produces:
  - Server Actions `saveStartDate(formData)`, `saveAccount(formData)` (create or update by optional `id`), `archiveAccountAction(id: string)`. Each returns `{ ok: true } | { ok: false; error: string }` and calls `revalidatePath("/accounts")`.
  - The e2e fixture user `ACCOUNTS_USER = { name: "E2E Accounts", email: "accounts@e2e.test", password: "e2e-accounts-password-1" }`, created in global-setup. global-setup now also creates `IMPORT_USER`, `TXN_USER`, and `NOSTART_USER` (same pattern, emails `import@e2e.test`, `txn@e2e.test`, `nostart@e2e.test`; seeded in Tasks 9–10; `NOSTART_USER` gets no start date).

- [ ] **Step 1: Write the failing e2e test** `e2e/accounts.spec.ts` (desktop only, serial; uses `ACCOUNTS_USER`)

```ts
test.describe.configure({ mode: "serial" });
test.beforeEach(({ isMobile }) => test.skip(isMobile, "stateful flow runs on desktop"));

test("sets the start date, adds an account, and shows its balance", async ({ page }) => {
  await page.goto("/sign-in?next=/accounts");
  await signIn(page, ACCOUNTS_USER);
  await expect(page.getByText("When does tracking start?")).toBeVisible();
  await page.getByLabel("Tracking start date").fill("2026-11-07");
  await page.getByRole("button", { name: "Save start date" }).click();
  await expect(page.getByText("Tracking since Nov 7, 2026")).toBeVisible();

  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("UFCU Checking");
  await dialog.getByLabel("Type").selectOption("checking");
  await dialog.getByLabel("Bank").fill("UFCU");
  await dialog.getByLabel("Balance on Nov 7, 2026").fill("1,520.34");
  await dialog.getByRole("button", { name: "Save account" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "UFCU Checking" });
  await expect(row.getByText("$1,520.34")).toBeVisible();
});

test("rejects a bad balance with a clear message", async ({ page }) => {
  await page.goto("/sign-in?next=/accounts");
  await signIn(page, ACCOUNTS_USER);
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Broken");
  await dialog.getByLabel("Balance on Nov 7, 2026").fill("lots");
  await dialog.getByRole("button", { name: "Save account" }).click();
  await expect(dialog.getByText("Enter the balance as a dollar amount, like 1,520.34")).toBeVisible();
});
```

Remove `/accounts`, `/import`, and `/transactions` from `shell.spec.ts`'s placeholder list. Change the Recurring placeholder's phase to `Phase 1c`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:e2e e2e/accounts.spec.ts --project=desktop`
Expected: FAIL (no "When does tracking start?").

- [ ] **Step 3: Build the page**

**Start-date card:**
- When unset: title "When does tracking start?", body "Pick the day you start fresh, usually your next payday. Anything earlier in your bank files is skipped.", a date input labeled `Tracking start date`, and `Save start date`.
- When set: "Tracking since {formatDisplayDate}" with a `Change` link that reopens the input.

**Account list:**
- `<ul>` of accounts: name, institution · type, `•••• lastFour` if set, `balanceCents` (`.num`), and "Last import {date}" or "No imports yet".
- Row menu: Edit, Archive.

**Account dialog:**
- Fields: `Name`, `Type` (native select of `AccountType`), `Bank`, `Last four digits (optional)`, and `Balance on {start date}` (or `Starting balance` when no start date).
- The balance is parsed with `parseAmountToCents`. On failure, show "Enter the balance as a dollar amount, like 1,520.34".

**Empty state:** "Add the accounts you'll import from, with each one's balance on your start date."

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:e2e e2e/accounts.spec.ts e2e/shell.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: accounts page with tracking start date and starting balances"
```

---

### Task 9: Import page

**Files:**
- Create: `src/app/(app)/import/actions.ts`, `src/components/import/{dropzone,file-card,mapping-editor,import-summary,recent-imports}.tsx`, `e2e/fixtures/{ufcu-checking.csv,ally-spending.csv}` (copies of the Task 4 fixtures)
- Modify: `src/app/(app)/import/page.tsx`, `e2e/global-setup.ts`
- Test: `e2e/import.spec.ts`

**Interfaces:**
- Consumes: `previewImport`, `commitImport`, `undoImport`, `listImportBatches`, `listAccounts`, `getSettings`.
- Produces:
  - Server Actions `previewFile(formData: FormData): Promise<ImportPreview | { error: string }>`, where the form has `file` plus an optional `mapping` (JSON);
  - `importFile(formData: FormData): Promise<ImportResult | { error: string }>`, where the form has `file`, `accountId`, and an optional `mapping`;
  - `undoBatch(batchId: string)`.

  Each action catches `ImportError` and `NotFoundError` into `{ error }`, and calls `revalidatePath` for `/import`, `/transactions`, and `/accounts`. **One file per action call** (body limit).
- global-setup seeds `IMPORT_USER` with start date `2026-11-07` and accounts `UFCU Checking` (institution UFCU) and `Ally Spending` (institution Ally, type checking).

- [ ] **Step 1: Write the failing e2e test** `e2e/import.spec.ts` (desktop, serial, `IMPORT_USER`)

```ts
test("imports UFCU and Ally files together, then skips duplicates on re-upload, then undoes", async ({ page }) => {
  await page.goto("/sign-in?next=/import");
  await signIn(page, IMPORT_USER);
  await page.getByLabel("Choose files").setInputFiles(["e2e/fixtures/ufcu-checking.csv", "e2e/fixtures/ally-spending.csv"]);

  const ufcu = page.getByRole("article").filter({ hasText: "ufcu-checking.csv" });
  const ally = page.getByRole("article").filter({ hasText: "ally-spending.csv" });
  await expect(ufcu.getByText("UFCU export")).toBeVisible();
  await expect(ufcu.getByText("5 to import · 1 pending skipped · 1 before your start date")).toBeVisible();
  await expect(ufcu.getByLabel("Account")).toHaveValue(/.+/);
  await expect(ally.getByText("3 to import · 1 before your start date")).toBeVisible();
  await expect(ally.getByLabel("Account")).toHaveValue(/.+/);

  await page.getByRole("button", { name: "Import 2 files" }).click();
  await expect(ufcu.getByText("5 imported")).toBeVisible();
  await expect(ally.getByText("3 imported")).toBeVisible();

  await page.getByRole("button", { name: "Import more" }).click();
  await page.getByLabel("Choose files").setInputFiles(["e2e/fixtures/ufcu-checking.csv"]);
  await page.getByRole("button", { name: "Import 1 file" }).click();
  await expect(page.getByText("0 imported · 5 already here")).toBeVisible();

  const recent = page.getByRole("region", { name: "Recent imports" });
  await recent.getByRole("listitem").filter({ hasText: "ally-spending.csv" }).getByRole("button", { name: "Undo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo import" }).click();
  await expect(recent.getByRole("listitem").filter({ hasText: "ally-spending.csv" }).getByText("Undone")).toBeVisible();
});

test("sends you to set a start date first", async ({ page }) => {
  await page.goto("/sign-in?next=/import");
  await signIn(page, NOSTART_USER);
  await expect(page.getByText("Set your tracking start date first")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Accounts" })).toHaveAttribute("href", "/accounts");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:e2e e2e/import.spec.ts --project=desktop`
Expected: FAIL.

- [ ] **Step 3: Build the page**
- **No start date or no accounts:** show an EmptyState with the message and a `Go to Accounts` link.
- **Dropzone:** a `<label>` with "Choose files" text wrapping a hidden `<input type="file" multiple accept=".csv,.xlsx,.ofx,.qfx">`; drag-and-drop also works. Each chosen file is previewed immediately (`previewFile`, one call per file, in parallel).
- **File card** (`<article>`):
  - file name, format label badge, and an `Account` select (preselected by `suggestedAccountId`);
  - a count line built from the non-zero parts: `{ready} to import`, `{pending} pending skipped`, `{beforeStart} before your start date`, `{errors} rows couldn't be read`;
  - a sample table of 5 rows with date, description, and amount;
  - a collapsible error list with line numbers;
  - when `needsMapping`, the **mapping editor**: selects for Date column, Date format, Description column, and Amount style (one column / money in-out indicator / separate debit & credit) with its columns. Changing a select re-runs `previewFile` with the mapping.
- **Import button:** `Import N file(s)`, disabled until every file has an account and none needs mapping. It runs `importFile` sequentially and swaps each card to its result: `{imported} imported` plus `· {duplicates} already here` when duplicates > 0. Then it shows `Import more` and `View transactions`.
- **Recent imports** (`<section aria-label="Recent imports">`): a list of batches with file name, account, date, imported count, and an `Undo` button (an AlertDialog confirming `Undo import`), or `Undone`.
- **Mobile:** cards stack; the sample table scrolls inside the card (`overflow-x-auto`), never the page.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:e2e e2e/import.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: multi-file import page with previews, mapping, results, and undo"
```

---

### Task 10: Transactions page

**Files:**
- Create: `src/app/(app)/transactions/actions.ts`, `src/components/transactions/{transaction-list,filters-bar,category-select,quick-add,transaction-sheet,bulk-bar}.tsx`
- Modify: `src/app/(app)/transactions/page.tsx`, `e2e/global-setup.ts`
- Test: `e2e/transactions.spec.ts`

**Interfaces:**
- Consumes: the transactions and categories services, `listAccounts`, `formatCents`, `formatDisplayDate`.
- Produces:
  - Server Actions:
    - `loadMore(filters: TransactionFilters)`;
    - `setCategory(id: string, categoryId: string | null)`;
    - `bulkCategorize(ids: string[], categoryId: string | null)`;
    - `addTransaction(formData)`, where the form has `accountId`, `date`, `description`, `amount`, and `direction` (`out` | `in`);
    - `saveNotes(id: string, notes: string)`;
    - `removeTransaction(id: string)`.
  - Filters live in the URL search params (`q`, `account`, `category`, `from`, `to`), so they survive reloads and can be shared.
- global-setup seeds `TXN_USER`: start date `2026-11-07`, account `UFCU Checking`, and the UFCU fixture imported through `commitImport`.

- [ ] **Step 1: Write the failing e2e test** `e2e/transactions.spec.ts` (desktop for edits; one mobile check)

```ts
test("searches, categorizes one, bulk-categorizes, and sees history", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await expect(page.getByRole("heading", { level: 1, name: "Transactions" })).toBeVisible();
  await expect(page.getByText("Payroll Acme Corp")).toBeVisible();
  await expect(page.getByText("+$1,200.00")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search transactions" }).fill("bennu");
  await expect(page).toHaveURL(/q=bennu/);
  await expect(page.getByRole("listitem").filter({ hasText: "Bennu Coffee" })).toHaveCount(2);

  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("region", { name: "Bulk actions" }).getByLabel("Category").selectOption({ label: "Coffee" });
  await page.getByRole("button", { name: "Apply to 2" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bennu Coffee" }).getByText("Coffee", { exact: true })).toHaveCount(2);

  await page.getByRole("listitem").filter({ hasText: "Bennu Coffee" }).first().getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("dialog").getByText("Category changed")).toBeVisible();
});

test("adds a cash transaction by hand", async ({ page, isMobile }) => {
  test.skip(isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await page.getByRole("button", { name: "Add transaction" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Description").fill("Farmers market");
  await d.getByLabel("Amount").fill("18");
  await d.getByLabel("Date").fill("2026-11-14");
  await d.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Farmers market" }).getByText("-$18.00")).toBeVisible();
});

test("is usable on a phone without sideways scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto("/sign-in?next=/transactions");
  await signIn(page, TXN_USER);
  await expect(page.getByText("Payroll Acme Corp")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:e2e e2e/transactions.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Build the page**

**Page structure:**
- Server component: reads `searchParams` and renders the first page from `listTransactions`. `Load more` uses `loadMore`.
- Rows are grouped under date headings (`formatDisplayDate`).
- Each row (`<li>`): a select checkbox, description, account name (muted), an inline `CategorySelect` (native select, grouped by category group, with "Uncategorized" first), the amount (`formatCents` with `sign: "always"` for money in, `text-positive` for in), and a `Details` button.

**Filters bar:**
- `searchbox` "Search transactions" (debounced 300 ms, updates the URL);
- account and category selects (including "Uncategorized");
- From / To dates;
- `Clear`.

**Bulk bar** (`<section aria-label="Bulk actions">`): appears when rows are selected: "N selected", a `Category` select, and an `Apply to N` button.

**Detail sheet:**
- the description, amount, date, account, notes textarea (saves on blur), category, and source;
- a "History" list from `getTransactionHistory`, with actions rendered as "Imported" / "Added by hand" / "Category changed" / "Notes changed";
- a `Delete` button only for manual rows.

**Add transaction dialog:**
- `Description`, `Amount` (positive number), a Money out / Money in toggle (default out), `Date` (default today in the user's timezone), and `Account`;
- submits `addTransaction`.

**Empty states:**
- no transactions at all: "No transactions yet. Import your bank files to get started." with an `Import files` link;
- no matches: "No transactions match these filters." with `Clear filters`.

**Mobile:** the category select and amount wrap under the description, and the checkboxes hide until "Select" mode is toggled.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:e2e`
Expected: the whole e2e suite passes on both projects.

- [ ] **Step 5: Visual check**

Screenshot `/accounts`, `/import` (with two previewed files), and `/transactions` at 375×812 and 1280×800, light and dark. Check against spec §15 and fix before committing.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: transactions page with search, filters, categorizing, quick add, and history"
```

---

### Task 11: Ship and owner acceptance

**Files:**
- Modify: `docs/setup.md` (append "Your first import" section), `README.md` (status line)

- [ ] **Step 1: Write the owner's first-import steps** in `docs/setup.md`:
1. **Accounts:** set **Tracking start date** to the payday you're starting from.
2. Add **UFCU Checking**, **UFCU Savings**, **Ally Spending**, and **Ally Savings**, each with its balance at the start of that day (the bank's balance from the end of the day before).
3. **Import:** download a CSV from each account covering at least your start date to today, drop all four in, check each file's account, and choose **Import 4 files**.
4. **Accounts:** compare each balance with your bank app. They should match, apart from pending transactions.

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
Expected: all pass.

- [ ] **Step 3: Owner checkpoint**

Ask the owner for the go-ahead to merge to `main` and push (this deploys, and the production build runs migration `0001`). After deploying:

Run: `curl -s https://finnance-tau.vercel.app/api/auth/ok`
Expected: `{"ok":true}`.

- [ ] **Step 4: Owner acceptance (Phase 1a "done when")**

The owner follows "Your first import" with real exports. Phase 1a is done when all four files import in under 2 minutes, nothing before the start date or pending comes in, and all four balances match the banks.
