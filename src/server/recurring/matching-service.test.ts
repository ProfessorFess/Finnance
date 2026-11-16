import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { activityLog, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { setHidden } from "@/server/finance/transactions";
import { commitImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser, insertTestTransaction } from "@/test/users";
import {
  createIncomeSource,
  createRecurringRule,
  deleteIncomeSource,
  type IncomeSourceInput,
  listIncomeSources,
  type RecurringRuleInput,
  updateIncomeSource,
  updateRecurringRule,
} from "./items-service";
import { linkTransaction, listMatchOptions, matchRecurring, rematchItem } from "./matching-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;

const paycheck = (over: Partial<IncomeSourceInput> = {}): IncomeSourceInput => ({
  name: "Paycheck",
  type: "hourly",
  frequency: "biweekly",
  anchorDate: "2026-11-14",
  secondDay: null,
  amountMode: "varies",
  expectedCents: null,
  accountId: checking.id,
  categoryId: null,
  matchPattern: "Payroll Acme Corp",
  ...over,
});
const bill = (over: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
  name: "Prime",
  kind: "subscription",
  frequency: "monthly",
  anchorDate: "2026-11-14",
  secondDay: null,
  expectedCents: 2164,
  amountVaries: false,
  toleranceCents: null,
  accountId: checking.id,
  categoryId: null,
  matchPattern: "Prime Video",
  ...over,
});
const importChecking = (user = A, account = checking) =>
  commitImport(t.db, user, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: account.id });
const byDesc = async (description: string, user = A) =>
  t.db.select().from(transactions).where(and(eq(transactions.userId, user), eq(transactions.rawDescription, description)));
const one = async (description: string) => (await byDesc(description))[0]!;
const get = async (id: string) => (await t.db.select().from(transactions).where(eq(transactions.id, id)))[0]!;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("links the paycheck when the import arrives and reports it", async () => {
  const pay = await createIncomeSource(t.db, A, paycheck());
  const result = await importChecking();
  expect(result.matched).toBe(1);
  expect(await one("Payroll Acme Corp")).toMatchObject({ incomeSourceId: pay.id, expectedDate: "2026-11-14", matchSource: "auto" });
  const log = await t.db.select().from(activityLog).where(and(eq(activityLog.userId, A), eq(activityLog.action, "transaction.auto_match")));
  expect(log).toHaveLength(1);
});

it("creating an item matches rows already imported", async () => {
  await importChecking();
  const pay = await createIncomeSource(t.db, A, paycheck());
  expect(await one("Payroll Acme Corp")).toMatchObject({ incomeSourceId: pay.id, expectedDate: "2026-11-14", matchSource: "auto" });
});

it("editing the schedule re-matches", async () => {
  await importChecking();
  const pay = await createIncomeSource(t.db, A, paycheck({ anchorDate: "2026-11-10" }));
  expect((await one("Payroll Acme Corp")).incomeSourceId).toBeNull();
  await updateIncomeSource(t.db, A, pay.id, paycheck({ anchorDate: "2026-11-14" }));
  expect(await one("Payroll Acme Corp")).toMatchObject({ incomeSourceId: pay.id, expectedDate: "2026-11-14" });
});

it("never re-links a dismissed row and keeps manual links on rematch", async () => {
  await importChecking();
  const pay = await createIncomeSource(t.db, A, paycheck());
  const payroll = await one("Payroll Acme Corp");
  await linkTransaction(t.db, A, payroll.id, null);
  expect(await get(payroll.id)).toMatchObject({ matchSource: "dismissed", incomeSourceId: null, expectedDate: null });
  await rematchItem(t.db, A, { kind: "income", id: pay.id });
  await matchRecurring(t.db, A);
  expect(await get(payroll.id)).toMatchObject({ matchSource: "dismissed", incomeSourceId: null });

  const prime = await createRecurringRule(t.db, A, bill({ matchPattern: "Nope" }));
  const primeRow = await one("Prime Video");
  await linkTransaction(t.db, A, primeRow.id, { kind: "recurring", id: prime.id });
  expect(await get(primeRow.id)).toMatchObject({ recurringRuleId: prime.id, matchSource: "user", expectedDate: "2026-11-14" });
  await updateRecurringRule(t.db, A, prime.id, bill({ matchPattern: "Still Nope" }));
  expect(await get(primeRow.id)).toMatchObject({ recurringRuleId: prime.id, matchSource: "user" });
});

it("a manual link takes the nearest occurrence and bumps an automatic claimant", async () => {
  await importChecking();
  const club = await createRecurringRule(t.db, A, bill({ name: "Coffee club", matchPattern: "Bennu Coffee", anchorDate: "2026-11-13", expectedCents: 625 }));
  const rows = await byDesc("Bennu Coffee");
  const auto = rows.find((r) => r.recurringRuleId === club.id)!;
  const other = rows.find((r) => r.id !== auto.id)!;
  expect(auto).toMatchObject({ matchSource: "auto", expectedDate: "2026-11-13" });
  await linkTransaction(t.db, A, other.id, { kind: "recurring", id: club.id });
  expect(await get(other.id)).toMatchObject({ recurringRuleId: club.id, matchSource: "user", expectedDate: "2026-11-13" });
  expect(await get(auto.id)).toMatchObject({ recurringRuleId: null, matchSource: null, expectedDate: null });
});

it("fills a missing expected amount from the first matched deposit", async () => {
  await importChecking();
  await createIncomeSource(t.db, A, paycheck({ expectedCents: null }));
  expect((await listIncomeSources(t.db, A))[0]!.expectedCents).toBe(120_000);
});

it("deleting an item clears its links", async () => {
  await importChecking();
  const pay = await createIncomeSource(t.db, A, paycheck());
  await deleteIncomeSource(t.db, A, pay.id);
  expect(await one("Payroll Acme Corp")).toMatchObject({ incomeSourceId: null, matchSource: null, expectedDate: null });
});

it("skips hidden rows and rows before the start date", async () => {
  await importChecking();
  await insertTestTransaction(t.db, A, checking.id, { amountCents: 120_000, date: "2026-11-06", description: "Payroll Acme Corp" });
  await setHidden(t.db, A, (await byDesc("Payroll Acme Corp")).find((r) => r.date === "2026-11-14")!.id, true);
  await createIncomeSource(t.db, A, paycheck({ frequency: "irregular", anchorDate: null }));
  expect((await byDesc("Payroll Acme Corp")).every((r) => r.incomeSourceId === null)).toBe(true);
});

it("lists active items as link options", async () => {
  await createIncomeSource(t.db, A, paycheck());
  await createRecurringRule(t.db, A, bill({ active: false }));
  await createRecurringRule(t.db, A, bill({ name: "Phone", matchPattern: "Phone Co" }));
  expect((await listMatchOptions(t.db, A)).map((o) => [o.name, o.direction])).toEqual([
    ["Paycheck", "in"],
    ["Phone", "out"],
  ]);
});

it("isolates users", async () => {
  await importChecking();
  const payroll = await one("Payroll Acme Corp");
  await expect(linkTransaction(t.db, B, payroll.id, null)).rejects.toThrow(NotFoundError);
  const pay = await createIncomeSource(t.db, A, paycheck());
  await linkTransaction(t.db, A, payroll.id, null);
  await setTrackingStartDate(t.db, B, "2026-11-07");
  await expect(linkTransaction(t.db, B, payroll.id, { kind: "income", id: pay.id })).rejects.toThrow(NotFoundError);
  expect(await matchRecurring(t.db, B)).toBe(0);
  expect((await get(payroll.id)).matchSource).toBe("dismissed");
});

it("a second manual link to a held occurrence links without fulfilling it, instead of crashing", async () => {
  await importChecking();
  const club = await createRecurringRule(t.db, A, bill({ name: "Coffee club", matchPattern: "Nothing", anchorDate: "2026-11-13", expectedCents: 625 }));
  const [first, second] = await byDesc("Bennu Coffee");
  await linkTransaction(t.db, A, first!.id, { kind: "recurring", id: club.id });
  await linkTransaction(t.db, A, second!.id, { kind: "recurring", id: club.id });
  expect(await get(first!.id)).toMatchObject({ recurringRuleId: club.id, matchSource: "user", expectedDate: "2026-11-13" });
  expect(await get(second!.id)).toMatchObject({ recurringRuleId: club.id, matchSource: "user", expectedDate: null });
});

it("a manual link far from any occurrence fulfils nothing and leaves the automatic match alone", async () => {
  await importChecking();
  const prime = await createRecurringRule(t.db, A, bill());
  const auto = await one("Prime Video");
  expect(auto).toMatchObject({ recurringRuleId: prime.id, matchSource: "auto", expectedDate: "2026-11-14" });
  const old = await insertTestTransaction(t.db, A, checking.id, { amountCents: -2164, date: "2026-10-14", description: "Prime Video" });
  await linkTransaction(t.db, A, old.id, { kind: "recurring", id: prime.id });
  expect(await get(old.id)).toMatchObject({ recurringRuleId: prime.id, matchSource: "user", expectedDate: null });
  expect(await get(auto.id)).toMatchObject({ recurringRuleId: prime.id, matchSource: "auto", expectedDate: "2026-11-14" });
});

it("doesn't treat a single deposit as irregular income's monthly amount", async () => {
  await importChecking();
  await createIncomeSource(t.db, A, paycheck({ frequency: "irregular", anchorDate: null, expectedCents: null }));
  expect((await one("Payroll Acme Corp")).incomeSourceId).not.toBeNull();
  expect((await listIncomeSources(t.db, A))[0]!.expectedCents).toBeNull();
});

it("pausing an item keeps its past matches", async () => {
  await importChecking();
  const pay = await createIncomeSource(t.db, A, paycheck());
  await updateIncomeSource(t.db, A, pay.id, { ...paycheck(), active: false });
  expect(await one("Payroll Acme Corp")).toMatchObject({ incomeSourceId: pay.id, matchSource: "auto" });
});
