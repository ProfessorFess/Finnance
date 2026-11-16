import { afterEach, beforeEach, expect, it } from "vitest";
import { type Account, createAccount } from "@/server/finance/accounts";
import { setTrackingStartDate } from "@/server/finance/settings";
import { commitImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { createIncomeSource, createRecurringRule, type IncomeSourceInput, type RecurringRuleInput } from "./items-service";
import { getRecurringOverview } from "./overview";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
const now = new Date("2026-11-15T18:00:00Z");

const paycheck = (over: Partial<IncomeSourceInput> = {}): IncomeSourceInput => ({
  name: "Paycheck",
  type: "hourly",
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
const rule = (over: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
  name: "Prime Video",
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

it("summarizes the owner's paycheck and a subscription", async () => {
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  await createIncomeSource(t.db, A, paycheck());
  await createRecurringRule(t.db, A, rule());
  const o = await getRecurringOverview(t.db, A, now);
  expect(o.today).toBe("2026-11-15");
  expect(o.income[0]).toMatchObject({
    name: "Paycheck",
    lastMatch: { date: "2026-11-14", amountCents: 120_000 },
    nextDate: "2026-11-28",
    state: "upcoming",
    monthlyCents: 260_000,
    amountBasis: "set",
    accountName: "UFCU Checking",
  });
  expect(o.bills[0]).toMatchObject({ name: "Prime Video", kind: "subscription", lastMatch: { date: "2026-11-14", amountCents: 2164 }, nextDate: "2026-12-14", monthlyCents: 2164 });
  expect(o.bills[0]!.recentMatches).toHaveLength(1);
  expect(o).toMatchObject({ monthlyIncomeCents: 260_000, monthlyBillsCents: 2164, hasStartDate: true });
});

it("judges lateness by each account's own data", async () => {
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  const savings = await createAccount(t.db, A, { name: "UFCU Savings", type: "savings", startingBalanceCents: 0 });
  await insertTestTransaction(t.db, A, savings.id, { amountCents: 100, date: "2026-11-30", description: "Interest" });
  await createRecurringRule(t.db, A, rule({ name: "Gym", anchorDate: "2026-11-12", matchPattern: "Nothing Here", expectedCents: 1000 }));
  const o = await getRecurringOverview(t.db, A, new Date("2026-12-01T18:00:00Z"));
  expect(o.bills[0]).toMatchObject({ state: "awaiting", awaitingDates: ["2026-11-12"], lateDates: [] });
});

it("leaves transfers out of the bills total and paused items out of all totals", async () => {
  await createRecurringRule(t.db, A, rule());
  await createRecurringRule(t.db, A, rule({ name: "To savings", kind: "transfer", expectedCents: 40_000, matchPattern: "Transfer To Share" }));
  await createRecurringRule(t.db, A, rule({ name: "Old app", expectedCents: 999, matchPattern: "Old App", active: false }));
  await createIncomeSource(t.db, A, paycheck({ active: false }));
  const o = await getRecurringOverview(t.db, A, now);
  expect(o.bills).toHaveLength(3);
  expect(o.bills.find((b) => b.name === "Old app")!.state).toBe("paused");
  expect(o.monthlyBillsCents).toBe(2164);
  expect(o.monthlyIncomeCents).toBe(0);
});

it("returns nothing before a start date is set, and isolates users", async () => {
  await createIncomeSource(t.db, A, paycheck());
  expect(await getRecurringOverview(t.db, B, now)).toMatchObject({ hasStartDate: false, income: [], bills: [] });
  await setTrackingStartDate(t.db, B, "2026-11-07");
  expect((await getRecurringOverview(t.db, B, now)).income).toEqual([]);
});
