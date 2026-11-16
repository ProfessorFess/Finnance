import { afterEach, beforeEach, expect, it } from "vitest";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { commitImport } from "@/server/import/service";
import { createIncomeSource, createRecurringRule, deleteIncomeSource, type IncomeSource, type IncomeSourceInput, updateIncomeSource } from "@/server/recurring/items-service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { matchRecurring } from "@/server/recurring/matching-service";
import { createPlan } from "./plans-service";
import { getPlanStatus } from "./status-service";
import { templateDrafts } from "./templates";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let allySav: Account;
let allySpend: Account;
let pay: IncomeSource;
const now = new Date("2026-11-18T18:00:00Z");

const income = (over: Partial<IncomeSourceInput> = {}): IncomeSourceInput => ({
  name: "Paycheck",
  type: "salary",
  frequency: "biweekly",
  anchorDate: "2026-11-14",
  secondDay: null,
  amountMode: "fixed",
  expectedCents: 120_000,
  accountId: checking.id,
  categoryId: null,
  matchPattern: "Payroll Acme Corp",
  ...over,
});
const byName = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name === name)!;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
  allySpend = await createAccount(t.db, A, { name: "Ally Spending", type: "checking", startingBalanceCents: 0 });
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  pay = await createIncomeSource(t.db, A, income());
  await createRecurringRule(t.db, A, {
    name: "Prime Video", kind: "subscription", frequency: "monthly", anchorDate: "2026-11-14", secondDay: null, expectedCents: 2164,
    amountVaries: false, toleranceCents: null, accountId: checking.id, categoryId: null, matchPattern: "Prime Video",
  });
  const d = templateDrafts("paycheck_plan", await listCategories(t.db, A));
  d.buckets[0] = { ...d.buckets[0]!, fundingCents: 40_000, destinationAccountId: allySav.id };
  d.buckets[2] = { ...d.buckets[2]!, fundingCents: 40_000, limitCents: 20_000, destinationAccountId: allySpend.id };
  await createPlan(t.db, A, { template: "paycheck_plan", cadence: "per_income", name: "Paycheck plan", incomeSourceIds: [pay.id], buckets: d.buckets, extraIncome: { bucketIndex: 0, incomeSourceId: pay.id } });
});
afterEach(async () => {
  await t.close();
});

it("shows the latest income, its tasks, and each bucket", async () => {
  const s = (await getPlanStatus(t.db, A, now))!;
  expect(s.latestIncome).toMatchObject({ sourceName: "Paycheck", date: "2026-11-14", amountCents: 120_000, isExtra: false });
  expect(s.incomesPerMonth).toBe(2);
  expect(s.buckets.map((b) => [b.name, b.fundedCents])).toEqual([
    ["Savings & investing", 40_000],
    ["Bills", 1_082],
    ["Weekly spending", 40_000],
    ["Goal fund / buffer", 38_918],
  ]);
  expect(s.health).toEqual({ kind: "fully_allocated" });
  expect(byName(s.buckets, "Weekly spending")).toMatchObject({ limitCents: 20_000, window: { start: "2026-11-16", end: "2026-11-22" }, resetsOn: "2026-11-23", activityCents: 0, remainingCents: 20_000 });
  // Bills are paid monthly, so a bills bucket without its own limit is measured over the month against its monthly total.
  expect(byName(s.buckets, "Bills")).toMatchObject({ window: { start: "2026-11-01", end: "2026-11-30" }, activityCents: 2_164, limitCents: 2_164, remainingCents: 0 });
  expect(s.tasks.map((x) => [x.bucketName, x.destinationAccountName, x.amountCents, x.movedCents])).toEqual([
    ["Savings & investing", "Ally Savings", 40_000, 0],
    ["Weekly spending", "Ally Spending", 40_000, 0],
  ]);
  expect(s.nextExpected).toEqual({ sourceName: "Paycheck", date: "2026-11-28", amountCents: 120_000 });
  expect(s.problem).toBeNull();
});

it("works with whatever income exists", async () => {
  const early = (await getPlanStatus(t.db, A, new Date("2026-11-10T18:00:00Z")))!;
  expect(early).toMatchObject({ problem: null, latestIncome: null, tasks: [] });
  expect(early.buckets.map((b) => b.typicalFundedCents)).toEqual([40_000, 1_082, 40_000, 38_918]);

  await updateIncomeSource(t.db, A, pay.id, { ...income(), active: false });
  const paused = (await getPlanStatus(t.db, A, now))!;
  expect(paused).toMatchObject({ problem: null, nextExpected: null });
  expect(paused.latestIncome?.date).toBe("2026-11-14");

  await updateIncomeSource(t.db, A, pay.id, { ...income(), frequency: "irregular", anchorDate: null });
  expect(await getPlanStatus(t.db, A, now)).toMatchObject({ problem: null, nextExpected: null });

  await deleteIncomeSource(t.db, A, pay.id);
  expect((await getPlanStatus(t.db, A, now))!.problem).toBe("no_income");
});

it("returns null without a plan, and isolates users", async () => {
  expect(await getPlanStatus(t.db, B, now)).toBeNull();
});

it("shows when a small paycheck can't cover the plan", async () => {
  await updateIncomeSource(t.db, A, pay.id, { ...income(), amountMode: "varies" });
  await insertTestTransaction(t.db, A, checking.id, { amountCents: 50_000, date: "2026-11-28", description: "Payroll Acme Corp" });
  await matchRecurring(t.db, A);
  const s = (await getPlanStatus(t.db, A, new Date("2026-11-29T18:00:00Z")))!;
  expect(s.latestIncome).toMatchObject({ amountCents: 50_000, health: { kind: "over", cents: 31_082 } });
});

it("a monthly plan with no expected amount doesn't claim it's over", async () => {
  const tips = await createIncomeSource(t.db, B, { ...income(), name: "Tips", frequency: "irregular", anchorDate: null, amountMode: "varies", expectedCents: null, accountId: null, matchPattern: "Tips" });
  await setTrackingStartDate(t.db, B, "2026-11-01");
  await createPlan(t.db, B, {
    template: "custom", cadence: "monthly", name: "B plan", incomeSourceIds: [tips.id], extraIncome: null,
    buckets: [{ name: "Rent", role: "bills", icon: "wallet", fundingType: "fixed", fundingCents: 120_000, fundingBps: null, limitCents: null, limitPeriod: null, trackCategoryIds: [], destinationAccountId: null }],
  });
  const s = (await getPlanStatus(t.db, B, now))!;
  expect(s.month).toMatchObject({ expectedCents: null });
  expect(s.health).toBeNull();
  expect(s.typicalIncomeCents).toBeNull();

  await updateIncomeSource(t.db, A, pay.id, { ...income(), active: false });
  const a = (await getPlanStatus(t.db, A, new Date("2026-11-10T18:00:00Z")))!;
  expect(a.health).toBeNull();
});
