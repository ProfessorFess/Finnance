// The owner's budget.xlsx (spec 13), built through the services: its numbers are the contract.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createIncomeSource, createRecurringRule } from "@/server/recurring/items-service";
import { matchRecurring } from "@/server/recurring/matching-service";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { bucketDraftOf, createPlan, getActivePlan, updateBucket } from "./plans-service";
import { getPlanStatus } from "./status-service";
import { templateDrafts } from "./templates";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let checking: Account;

async function owner(start: string, anchor: string) {
  await setTrackingStartDate(t.db, A, start);
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  const allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
  const allySpend = await createAccount(t.db, A, { name: "Ally Spending", type: "checking", startingBalanceCents: 0 });
  const pay = await createIncomeSource(t.db, A, {
    name: "Paycheck", type: "salary", frequency: "biweekly", anchorDate: anchor, secondDay: null, amountMode: "fixed",
    expectedCents: 120_000, accountId: checking.id, categoryId: null, matchPattern: "Payroll Acme",
  });
  for (const [name, cents] of [["Phone", 10_000], ["Subscriptions", 14_200], ["Haircuts", 3_000], ["Gas", 9_000]] as const) {
    await createRecurringRule(t.db, A, {
      name, kind: "bill", frequency: "monthly", anchorDate: anchor, secondDay: null, expectedCents: cents, amountVaries: true,
      toleranceCents: null, accountId: checking.id, categoryId: null, matchPattern: `${name} bill`,
    });
  }
  const d = templateDrafts("paycheck_plan", await listCategories(t.db, A));
  d.buckets[0] = { ...d.buckets[0]!, fundingCents: 40_000, destinationAccountId: allySav.id };
  d.buckets[2] = { ...d.buckets[2]!, fundingCents: 40_000, limitCents: 20_000, destinationAccountId: allySpend.id };
  await createPlan(t.db, A, { template: "paycheck_plan", cadence: "per_income", name: "Paycheck plan", incomeSourceIds: [pay.id], buckets: d.buckets, extraIncome: { bucketIndex: 0, incomeSourceId: pay.id } });
}

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

it("budget.xlsx: the per-paycheck split matches the spreadsheet", async () => {
  await owner("2026-11-07", "2026-11-13");
  const s = (await getPlanStatus(t.db, A, new Date("2026-11-16T18:00:00Z")))!;
  expect(s.typicalIncomeCents).toBe(120_000);
  expect(s.buckets.map((b) => [b.name, b.typicalFundedCents, b.monthlyCents])).toEqual([
    ["Savings & investing", 40_000, 80_000],
    ["Bills", 18_100, 36_200],
    ["Weekly spending", 40_000, 80_000],
    ["Goal fund / buffer", 21_900, 43_800],
  ]);
  expect(s.buckets.find((b) => b.name === "Weekly spending")!.limitCents).toBe(20_000);
  expect(s.health).toEqual({ kind: "fully_allocated" });
});

it("budget.xlsx: a bigger allowance reads Over budget", async () => {
  await owner("2026-11-07", "2026-11-13");
  const weekly = (await getActivePlan(t.db, A))!.buckets.find((b) => b.name === "Weekly spending")!;
  await updateBucket(t.db, A, weekly.id, { ...bucketDraftOf(weekly), fundingCents: 70_000, limitCents: 35_000 });
  const s = (await getPlanStatus(t.db, A, new Date("2026-11-16T18:00:00Z")))!;
  expect(s.health).toEqual({ kind: "over", cents: 8_100 });
  expect(s.buckets.find((b) => b.name === "Goal fund / buffer")!.typicalFundedCents).toBe(0);
});

it("budget.xlsx: the third paycheck goes to savings and the allowance continues", async () => {
  await owner("2027-01-01", "2027-01-01");
  for (const date of ["2027-01-01", "2027-01-15", "2027-01-29"]) {
    await insertTestTransaction(t.db, A, checking.id, { amountCents: 120_000, date, description: "Payroll Acme" });
  }
  await matchRecurring(t.db, A);
  const s = (await getPlanStatus(t.db, A, new Date("2027-01-30T18:00:00Z")))!;
  expect(s.latestIncome).toMatchObject({ date: "2027-01-29", amountCents: 120_000, isExtra: true });
  expect(s.buckets.map((b) => b.fundedCents)).toEqual([120_000, 0, 0, 0]);
  expect(s.tasks.map((x) => [x.bucketName, x.amountCents, x.destinationAccountName])).toEqual([["Savings & investing", 120_000, "Ally Savings"]]);
  expect(s.buckets.find((b) => b.name === "Weekly spending")!.limitCents).toBe(20_000);
  expect(s.health).toEqual({ kind: "fully_allocated" });
});
