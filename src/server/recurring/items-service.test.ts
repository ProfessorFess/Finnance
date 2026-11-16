import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { chooseCategory } from "@/server/categorize/learn";
import { listRules } from "@/server/categorize/rules-service";
import { activityLog, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { commitImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser } from "@/test/users";
import {
  createIncomeSource,
  createRecurringRule,
  deleteIncomeSource,
  deleteRecurringRule,
  type IncomeSourceInput,
  listIncomeSources,
  listRecurringRules,
  type RecurringRuleInput,
  updateIncomeSource,
  updateRecurringRule,
} from "./items-service";

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
const primeVideo = (over: Partial<RecurringRuleInput> = {}): RecurringRuleInput => ({
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
const importChecking = () => commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
const payrollRow = async () => (await t.db.select().from(transactions).where(eq(transactions.rawDescription, "Payroll Acme Corp")))[0]!;
const actions = async (entityType: string) =>
  (await t.db.select().from(activityLog).where(and(eq(activityLog.userId, A), eq(activityLog.entityType, entityType)))).map((a) => a.action);

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

it("creates, lists, updates, and deletes an income source", async () => {
  const created = await createIncomeSource(t.db, A, paycheck());
  expect((await listIncomeSources(t.db, A)).map((s) => s.name)).toEqual(["Paycheck"]);
  await updateIncomeSource(t.db, A, created.id, paycheck({ name: "Acme pay" }));
  expect((await listIncomeSources(t.db, A)).map((s) => s.name)).toEqual(["Acme pay"]);
  await deleteIncomeSource(t.db, A, created.id);
  expect(await listIncomeSources(t.db, A)).toEqual([]);
  expect(await actions("income_source")).toEqual(["income_source.create", "income_source.update", "income_source.delete"]);
});

it("creates, lists, updates, and deletes a recurring rule", async () => {
  const created = await createRecurringRule(t.db, A, primeVideo());
  expect(created).toMatchObject({ kind: "subscription", expectedCents: 2164, frequency: "monthly" });
  await updateRecurringRule(t.db, A, created.id, primeVideo({ expectedCents: 2299 }));
  expect((await listRecurringRules(t.db, A))[0]!.expectedCents).toBe(2299);
  await deleteRecurringRule(t.db, A, created.id);
  expect(await listRecurringRules(t.db, A)).toEqual([]);
  expect(await actions("recurring_rule")).toEqual(["recurring_rule.create", "recurring_rule.update", "recurring_rule.delete"]);
});

it("validates input", async () => {
  await expect(createIncomeSource(t.db, A, paycheck({ name: " " }))).rejects.toThrow("Give it a name");
  await expect(createIncomeSource(t.db, A, paycheck({ matchPattern: "  " }))).rejects.toThrow("Enter text to match");
  await expect(createIncomeSource(t.db, A, paycheck({ frequency: "semimonthly", secondDay: null }))).rejects.toThrow("Choose the second day of the month");
  await expect(createIncomeSource(t.db, A, paycheck({ frequency: "semimonthly", secondDay: 14 }))).rejects.toThrow("Choose the second day of the month");
  await expect(createIncomeSource(t.db, A, paycheck({ anchorDate: "2026-02-30" }))).rejects.toThrow("Choose the first date");
  await expect(createIncomeSource(t.db, A, paycheck({ expectedCents: 0 }))).rejects.toThrow("Enter an amount above $0");
  await expect(createRecurringRule(t.db, A, primeVideo({ frequency: "irregular" as never }))).rejects.toThrow("Irregular only works for income");
  await expect(createRecurringRule(t.db, A, primeVideo({ expectedCents: -5 }))).rejects.toThrow("Enter an amount above $0");
  expect((await createIncomeSource(t.db, A, paycheck({ frequency: "irregular", anchorDate: "2026-11-14", secondDay: 3 })))).toMatchObject({ anchorDate: null, secondDay: null });
});

it("a category on the item becomes a rule and sorts existing rows", async () => {
  await importChecking();
  const pay = (await listCategories(t.db, A)).find((c) => c.name === "Paycheck")!;
  await createIncomeSource(t.db, A, paycheck({ categoryId: pay.id }));
  expect(await listRules(t.db, A)).toContainEqual(expect.objectContaining({ matchType: "description_contains", pattern: "payroll acme corp", createdFrom: "recurring" }));
  expect(await payrollRow()).toMatchObject({ categoryId: pay.id, categorizationSource: "rule" });
});

it("leaves rows the user categorized alone", async () => {
  await importChecking();
  const cats = await listCategories(t.db, A);
  const gifts = cats.find((c) => c.name === "Gifts")!;
  await chooseCategory(t.db, A, (await payrollRow()).id, gifts.id);
  await createIncomeSource(t.db, A, paycheck({ categoryId: cats.find((c) => c.name === "Paycheck")!.id }));
  expect(await payrollRow()).toMatchObject({ categoryId: gifts.id, categorizationSource: "user" });
});

it("isolates users", async () => {
  const mine = await createIncomeSource(t.db, A, paycheck());
  const bill = await createRecurringRule(t.db, A, primeVideo());
  await expect(updateIncomeSource(t.db, B, mine.id, paycheck({ accountId: null }))).rejects.toThrow(NotFoundError);
  await expect(deleteIncomeSource(t.db, B, mine.id)).rejects.toThrow(NotFoundError);
  await expect(deleteRecurringRule(t.db, B, bill.id)).rejects.toThrow(NotFoundError);
  const theirs = await createAccount(t.db, B, { name: "B Checking", type: "checking", startingBalanceCents: 0 });
  await expect(createIncomeSource(t.db, A, paycheck({ accountId: theirs.id }))).rejects.toThrow(NotFoundError);
  expect(await listIncomeSources(t.db, B)).toEqual([]);
});
