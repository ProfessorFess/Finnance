// Households unlike the owner's (spec 1: "two jobs, a freelancer, or someone who prefers a monthly category budget").
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createIncomeSource, createRecurringRule } from "@/server/recurring/items-service";
import { matchRecurring } from "@/server/recurring/matching-service";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { createPlan } from "./plans-service";
import { getPlanStatus } from "./status-service";
import type { BucketDraft } from "./templates";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;

const draft = (over: Partial<BucketDraft> & Pick<BucketDraft, "name">): BucketDraft => ({
  role: "spending", icon: "wallet", fundingType: "fixed", fundingCents: null, fundingBps: null, limitCents: null, limitPeriod: null,
  trackCategoryIds: [], destinationAccountId: null, ...over,
});
const rule = (accountId: string, name: string, frequency: "monthly" | "quarterly", anchorDate: string, expectedCents: number) => ({
  name, kind: "bill" as const, frequency, anchorDate, secondDay: null, expectedCents, amountVaries: false, toleranceCents: null,
  accountId, categoryId: null, matchPattern: `${name} co`,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-01");
});
afterEach(async () => {
  await t.close();
});

it("a two-income household on a monthly plan", async () => {
  const checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  const cats = await listCategories(t.db, A);
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const day = await createIncomeSource(t.db, A, {
    name: "Day job", type: "salary", frequency: "semimonthly", anchorDate: "2026-11-15", secondDay: 31, amountMode: "fixed",
    expectedCents: 150_000, accountId: checking.id, categoryId: null, matchPattern: "Acme Payroll",
  });
  const free = await createIncomeSource(t.db, A, {
    name: "Freelance", type: "freelance", frequency: "irregular", anchorDate: null, secondDay: null, amountMode: "varies",
    expectedCents: 60_000, accountId: checking.id, categoryId: null, matchPattern: "Upwork",
  });
  await createRecurringRule(t.db, A, rule(checking.id, "Internet", "monthly", "2026-11-05", 6_000));
  await createRecurringRule(t.db, A, rule(checking.id, "Car insurance", "quarterly", "2026-11-05", 60_000));
  await createPlan(t.db, A, {
    template: "custom", cadence: "monthly", name: "Our budget", incomeSourceIds: [day.id, free.id], extraIncome: null,
    buckets: [
      draft({ name: "Rent", role: "bills", fundingCents: 120_000, trackCategoryIds: [cat("Rent & housing")] }),
      draft({ name: "Bills", role: "bills", fundingType: "sum_of_recurring" }),
      draft({ name: "Groceries", fundingCents: 50_000, limitCents: 50_000, limitPeriod: "monthly", trackCategoryIds: [cat("Groceries")] }),
      draft({ name: "Fun", fundingType: "percent", fundingBps: 1_000, trackCategoryIds: [cat("Restaurants"), cat("Entertainment")] }),
      draft({ name: "Savings", role: "savings", fundingType: "remainder" }),
    ],
  });
  await insertTestTransaction(t.db, A, checking.id, { amountCents: 150_000, date: "2026-11-14", description: "Acme Payroll" });
  await insertTestTransaction(t.db, A, checking.id, { amountCents: 45_000, date: "2026-11-10", description: "Upwork" });
  const g1 = await insertTestTransaction(t.db, A, checking.id, { amountCents: -8_000, date: "2026-11-03", description: "Grocer" });
  const g2 = await insertTestTransaction(t.db, A, checking.id, { amountCents: -4_500, date: "2026-11-20", description: "Grocer" });
  await t.db.update(transactions).set({ categoryId: cat("Groceries"), categorizationSource: "user" }).where(inArray(transactions.id, [g1.id, g2.id]));
  await matchRecurring(t.db, A);

  const s = (await getPlanStatus(t.db, A, new Date("2026-11-21T18:00:00Z")))!;
  expect(s.month).toEqual({ month: "2026-11", expectedCents: 360_000, receivedCents: 195_000 });
  expect(s.buckets.map((b) => [b.name, b.fundedCents])).toEqual([
    ["Rent", 120_000],
    ["Bills", 26_000],
    ["Groceries", 50_000],
    ["Fun", 36_000],
    ["Savings", 128_000],
  ]);
  expect(s.health).toEqual({ kind: "fully_allocated" });
  expect(s.buckets.find((b) => b.name === "Groceries")).toMatchObject({ window: { start: "2026-11-01", end: "2026-11-30" }, activityCents: 12_500, remainingCents: 37_500 });
  expect(s.nextExpected?.date).toBe("2026-11-30");
  expect(s.problem).toBeNull();
});

it("a gig worker splits each payout", async () => {
  const checking = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  const taxes = await createAccount(t.db, A, { name: "Tax savings", type: "savings", startingBalanceCents: 0 });
  const payouts = await createIncomeSource(t.db, A, {
    name: "Driver payouts", type: "freelance", frequency: "irregular", anchorDate: null, secondDay: null, amountMode: "varies",
    expectedCents: null, accountId: checking.id, categoryId: null, matchPattern: "Payout",
  });
  await createRecurringRule(t.db, A, rule(checking.id, "Phone", "monthly", "2026-11-05", 6_000));
  await createPlan(t.db, A, {
    template: "custom", cadence: "per_income", name: "Gig plan", incomeSourceIds: [payouts.id], extraIncome: null,
    buckets: [
      draft({ name: "Taxes", role: "savings", fundingType: "percent", fundingBps: 2_500, destinationAccountId: taxes.id }),
      draft({ name: "Bills", role: "bills", fundingType: "sum_of_recurring" }),
      draft({ name: "Savings", role: "savings", fundingType: "percent", fundingBps: 1_000 }),
      draft({ name: "Spending", fundingType: "remainder" }),
    ],
  });
  for (const [date, cents] of [["2026-11-03", 30_000], ["2026-11-10", 45_000], ["2026-11-17", 25_000]] as const) {
    await insertTestTransaction(t.db, A, checking.id, { amountCents: cents, date, description: "Payout" });
  }
  await matchRecurring(t.db, A);

  const s = (await getPlanStatus(t.db, A, new Date("2026-11-20T18:00:00Z")))!;
  expect(s.incomesPerMonth).toBe(3);
  expect(s.latestIncome).toMatchObject({ date: "2026-11-17", amountCents: 25_000, isExtra: false });
  expect(s.buckets.map((b) => [b.name, b.fundedCents, b.typicalFundedCents])).toEqual([
    ["Taxes", 6_250, 8_333],
    ["Bills", 2_000, 2_000],
    ["Savings", 2_500, 3_333],
    ["Spending", 14_250, 19_667],
  ]);
  expect(s.typicalIncomeCents).toBe(33_333);
  expect(s.health).toEqual({ kind: "fully_allocated" });
  expect(s.tasks.map((x) => [x.bucketName, x.amountCents, x.destinationAccountName, x.movedCents])).toEqual([["Taxes", 6_250, "Tax savings", 0]]);
  expect(s.nextExpected).toBeNull();
});
