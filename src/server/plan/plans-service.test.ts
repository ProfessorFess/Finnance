import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { recurringRules } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createIncomeSource, createRecurringRule, type IncomeSourceInput, type RecurringRuleInput } from "@/server/recurring/items-service";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { createBucket, createPlan, deleteBucket, deletePlan, getActivePlan, updateBucket } from "./plans-service";
import { type BucketDraft, templateDrafts } from "./templates";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let allySav: Account;
let allySpend: Account;

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
const bill = (over: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
  name: "Phone",
  kind: "bill",
  frequency: "monthly",
  anchorDate: "2026-11-05",
  secondDay: null,
  expectedCents: 10_000,
  amountVaries: false,
  toleranceCents: null,
  accountId: checking.id,
  categoryId: null,
  matchPattern: "Phone Co",
  ...over,
});
const draft = (over: Partial<BucketDraft> = {}): BucketDraft => ({
  name: "Groceries",
  role: "spending",
  icon: "shopping-basket",
  fundingType: "fixed",
  fundingCents: 50_000,
  fundingBps: null,
  limitCents: null,
  limitPeriod: null,
  trackCategoryIds: [],
  destinationAccountId: null,
  ...over,
});

async function paycheckPlan(user = A) {
  const pay = await createIncomeSource(t.db, user, income());
  const d = templateDrafts("paycheck_plan", await listCategories(t.db, user));
  d.buckets[0] = { ...d.buckets[0]!, fundingCents: 40_000, destinationAccountId: allySav.id };
  d.buckets[2] = { ...d.buckets[2]!, fundingCents: 40_000, limitCents: 20_000, destinationAccountId: allySpend.id };
  const plan = await createPlan(t.db, user, {
    template: "paycheck_plan",
    cadence: "per_income",
    name: "Paycheck plan",
    incomeSourceIds: [pay.id],
    buckets: d.buckets,
    extraIncome: { bucketIndex: 0, incomeSourceId: pay.id },
  });
  return { pay, plan };
}

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", startingBalanceCents: 0 });
  allySav = await createAccount(t.db, A, { name: "Ally Savings", type: "savings", startingBalanceCents: 0 });
  allySpend = await createAccount(t.db, A, { name: "Ally Spending", type: "checking", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("creates a plan from the paycheck template with the user's edits", async () => {
  const phone = await createRecurringRule(t.db, A, bill());
  const { pay } = await paycheckPlan();
  const active = (await getActivePlan(t.db, A))!;
  expect(active.buckets.map((b) => b.name)).toEqual(["Savings & investing", "Bills", "Weekly spending", "Goal fund / buffer"]);
  const [savings, bills, weekly] = active.buckets;
  expect(weekly).toMatchObject({ fundingCents: 40_000, limitCents: 20_000, limitPeriod: "weekly", destinationAccountId: allySpend.id });
  expect(active.rules).toEqual([expect.objectContaining({ type: "extra_income", bucketId: savings!.id, incomeSourceId: pay.id, percentBps: 10_000 })]);
  expect(active.incomeSourceIds).toEqual([pay.id]);
  const [phoneRow] = await t.db.select().from(recurringRules).where(eq(recurringRules.id, phone.id));
  expect(phoneRow!.bucketId).toBe(bills!.id);
});

it("creates plans for incomes of any kind", async () => {
  const day = await createIncomeSource(t.db, A, income({ name: "Day job", frequency: "semimonthly", anchorDate: "2026-11-15", secondDay: 31 }));
  const free = await createIncomeSource(t.db, A, income({ name: "Freelance", frequency: "irregular", anchorDate: null, amountMode: "varies", expectedCents: 60_000, matchPattern: "Upwork" }));
  await createPlan(t.db, A, {
    template: "custom",
    cadence: "monthly",
    name: "Our budget",
    incomeSourceIds: [day.id, free.id],
    buckets: [draft(), ...templateDrafts("custom", []).buckets],
    extraIncome: null,
  });
  const active = (await getActivePlan(t.db, A))!;
  expect(active.incomeSourceIds.sort()).toEqual([day.id, free.id].sort());
  expect(active.plan.cadence).toBe("monthly");
  expect(active.rules).toEqual([]);

  await deletePlan(t.db, A, active.plan.id);
  const payouts = await createIncomeSource(t.db, A, income({ name: "Driver payouts", frequency: "irregular", anchorDate: null, amountMode: "varies", expectedCents: null, matchPattern: "Payout" }));
  await createPlan(t.db, A, { template: "custom", cadence: "per_income", name: "Gig plan", incomeSourceIds: [payouts.id], buckets: templateDrafts("custom", []).buckets, extraIncome: null });
  expect((await getActivePlan(t.db, A))!.plan.name).toBe("Gig plan");
});

it("validates plans and buckets", async () => {
  const pay = await createIncomeSource(t.db, A, income());
  const free = await createIncomeSource(t.db, A, income({ name: "Freelance", frequency: "irregular", anchorDate: null, amountMode: "varies", matchPattern: "Upwork" }));
  const base = { template: "custom" as const, cadence: "per_income" as const, name: "P", incomeSourceIds: [pay.id], buckets: [draft()], extraIncome: null };
  await expect(createPlan(t.db, A, { ...base, incomeSourceIds: [] })).rejects.toThrow("Choose at least one income");
  await expect(createPlan(t.db, A, { ...base, buckets: [] })).rejects.toThrow("A plan needs at least one bucket");
  await expect(createPlan(t.db, A, { ...base, buckets: [draft({ fundingCents: 0 })] })).rejects.toThrow("Enter an amount above $0");
  await expect(createPlan(t.db, A, { ...base, buckets: [draft({ fundingType: "percent", fundingCents: null, fundingBps: 0 })] })).rejects.toThrow("Enter a percent between 1 and 100");
  await expect(createPlan(t.db, A, { ...base, buckets: [draft({ limitPeriod: "weekly", limitCents: null })] })).rejects.toThrow("Enter a limit above $0");
  await expect(
    createPlan(t.db, A, { ...base, buckets: [draft({ fundingType: "remainder", fundingCents: null }), draft({ name: "Two", fundingType: "remainder", fundingCents: null })] }),
  ).rejects.toThrow("Only one bucket can take what's left");
  await expect(createPlan(t.db, A, { ...base, cadence: "monthly", extraIncome: { bucketIndex: 0, incomeSourceId: pay.id } })).rejects.toThrow(
    "Extra-income rules apply to plans that split each income",
  );
  await expect(createPlan(t.db, A, { ...base, incomeSourceIds: [free.id], extraIncome: { bucketIndex: 0, incomeSourceId: free.id } })).rejects.toThrow(
    "Choose an income with a schedule for this rule",
  );
  await expect(createPlan(t.db, A, { ...base, buckets: [draft({ name: " " })] })).rejects.toThrow("Give it a name");

  const plan = await createPlan(t.db, A, base);
  await expect(createPlan(t.db, A, base)).rejects.toThrow("You already have a plan");
  const [only] = (await getActivePlan(t.db, A))!.buckets;
  await expect(deleteBucket(t.db, A, only!.id)).rejects.toThrow("A plan needs at least one bucket");
  const second = await createBucket(t.db, A, plan.id, draft({ name: "Fun", fundingType: "percent", fundingCents: null, fundingBps: 1_000 }));
  expect((await updateBucket(t.db, A, second.id, draft({ name: "Fun money", fundingType: "percent", fundingCents: null, fundingBps: 1_500 }))).fundingBps).toBe(1_500);
  await deleteBucket(t.db, A, second.id);
  expect((await getActivePlan(t.db, A))!.buckets).toHaveLength(1);
});

it("new bills join the plan's bills bucket unless told otherwise", async () => {
  await paycheckPlan();
  const [, bills, weekly] = (await getActivePlan(t.db, A))!.buckets;
  expect((await createRecurringRule(t.db, A, bill({ name: "Netflix", kind: "subscription", matchPattern: "Netflix" }))).bucketId).toBe(bills!.id);
  expect((await createRecurringRule(t.db, A, bill({ name: "Spotify", kind: "subscription", matchPattern: "Spotify", bucketId: weekly!.id }))).bucketId).toBe(weekly!.id);
  expect((await createRecurringRule(t.db, A, bill({ name: "To savings", kind: "transfer", matchPattern: "Transfer" }))).bucketId).toBeNull();
});

it("isolates users", async () => {
  const { plan } = await paycheckPlan();
  const [bucket] = (await getActivePlan(t.db, A))!.buckets;
  expect(await getActivePlan(t.db, B)).toBeNull();
  await expect(updateBucket(t.db, B, bucket!.id, draft())).rejects.toThrow(NotFoundError);
  await expect(deleteBucket(t.db, B, bucket!.id)).rejects.toThrow(NotFoundError);
  await expect(deletePlan(t.db, B, plan.id)).rejects.toThrow(NotFoundError);
  await expect(createBucket(t.db, B, plan.id, draft())).rejects.toThrow(NotFoundError);
  await setTrackingStartDate(t.db, B, "2026-11-07");
  const theirs = await createIncomeSource(t.db, B, { ...income(), accountId: null });
  await expect(
    createPlan(t.db, B, { template: "custom", cadence: "monthly", name: "B", incomeSourceIds: [theirs.id], buckets: [draft({ destinationAccountId: checking.id })], extraIncome: null }),
  ).rejects.toThrow(NotFoundError);
  await expect(createRecurringRule(t.db, B, { ...bill(), accountId: null, bucketId: bucket!.id })).rejects.toThrow(NotFoundError);
});
