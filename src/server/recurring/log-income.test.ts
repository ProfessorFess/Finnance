import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { commitImport, undoImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser } from "@/test/users";
import { createIncomeSource, type IncomeSourceInput } from "./items-service";
import { logIncome } from "./log-income";
import { getRecurringOverview } from "./overview";

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
  amountMode: "fixed",
  expectedCents: 120_000,
  accountId: checking.id,
  categoryId: null,
  matchPattern: "Payroll Acme Corp",
  ...over,
});
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

it("logs income by hand and links it to its source", async () => {
  const pay = await createIncomeSource(t.db, A, paycheck());
  const { transactionId } = await logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-14", amountCents: 120_000 });
  expect(await get(transactionId)).toMatchObject({ amountCents: 120_000, source: "manual", incomeSourceId: pay.id, matchSource: "user", expectedDate: "2026-11-14" });

  const tips = await createIncomeSource(t.db, A, paycheck({ name: "Tips", frequency: "irregular", anchorDate: null, amountMode: "varies", expectedCents: null, matchPattern: "Tips" }));
  const logged = await logIncome(t.db, A, { incomeSourceId: tips.id, accountId: checking.id, date: "2026-11-12", amountCents: 8_500 });
  expect(await get(logged.transactionId)).toMatchObject({ incomeSourceId: tips.id, expectedDate: null, rawDescription: "Tips" });

  await expect(logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-14", amountCents: 0 })).rejects.toThrow("Enter an amount above $0");
  await expect(logIncome(t.db, B, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-14", amountCents: 100 })).rejects.toThrow(NotFoundError);
});

it("an imported deposit replaces the matching logged income", async () => {
  const pay = await createIncomeSource(t.db, A, paycheck());
  const logged = await logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-13", amountCents: 118_000 });
  const far = await logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-24", amountCents: 120_000 });
  const small = await logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-15", amountCents: 50_000 });

  const result = await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  expect(result.replacedLogged).toBe(1);
  const [payroll] = await t.db.select().from(transactions).where(and(eq(transactions.userId, A), eq(transactions.rawDescription, "Payroll Acme Corp")));
  expect(payroll).toMatchObject({ incomeSourceId: pay.id, expectedDate: "2026-11-14" });
  expect(await get(logged.transactionId)).toMatchObject({ status: "excluded", incomeSourceId: null });
  expect((await get(far.transactionId)).status).not.toBe("excluded");
  expect((await get(small.transactionId)).status).not.toBe("excluded");

  const o = await getRecurringOverview(t.db, A, new Date("2026-11-15T18:00:00Z"));
  expect(o.income[0]!.recentMatches.filter((m) => m.date === "2026-11-14" || m.date === "2026-11-13")).toHaveLength(1);
});

it("undoing the import brings the logged income back", async () => {
  const pay = await createIncomeSource(t.db, A, paycheck());
  const logged = await logIncome(t.db, A, { incomeSourceId: pay.id, accountId: checking.id, date: "2026-11-13", amountCents: 118_000 });
  const result = await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  expect(result.replacedLogged).toBe(1);
  await undoImport(t.db, A, result.batchId);
  expect(await get(logged.transactionId)).toMatchObject({ status: "cleared", incomeSourceId: pay.id, expectedDate: "2026-11-14", matchSource: "user" });
});
