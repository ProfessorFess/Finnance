import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { activityLog, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { type Category, listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { setCategoryBulk } from "@/server/finance/transactions";
import { commitImport } from "@/server/import/service";
import { createTestDb } from "@/test/db";
import { fixtureBytes } from "@/test/fixtures";
import { createTestUser } from "@/test/users";
import { alwaysCategorize, chooseCategory } from "./learn";
import { listRules } from "./rules-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
let checking: Account;
let coffee: Category;
let bennu1: string;
let bennu2: string;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
  await setTrackingStartDate(t.db, A, "2026-11-07");
  checking = await createAccount(t.db, A, { name: "UFCU Checking", type: "checking", institution: "UFCU", startingBalanceCents: 0 });
  await commitImport(t.db, A, { file: { name: "ufcu.csv", bytes: fixtureBytes("ufcu-checking.csv") }, accountId: checking.id });
  coffee = (await listCategories(t.db, A)).find((c) => c.name === "Coffee")!;
  [bennu1, bennu2] = (await t.db.select({ id: transactions.id }).from(transactions).where(eq(transactions.rawDescription, "Bennu Coffee"))).map((r) => r.id) as [string, string];
});
afterEach(async () => {
  await t.close();
});

it("offers a rule after the first correction", async () => {
  const { row, learned } = await chooseCategory(t.db, A, bennu1, coffee.id);
  expect(row).toMatchObject({ categoryId: coffee.id, categorizationSource: "user", needsReview: false });
  expect(learned).toEqual({ kind: "suggest", merchant: "Bennu Coffee", categoryId: coffee.id, categoryName: "Coffee" });
});

it("creates the rule itself after the second correction, and applies it", async () => {
  await chooseCategory(t.db, A, bennu1, coffee.id);
  const { learned } = await chooseCategory(t.db, A, bennu2, coffee.id);
  expect(learned).toMatchObject({ kind: "ruleCreated", merchant: "Bennu Coffee", categoryName: "Coffee" });
  expect((await listRules(t.db, A)).some((r) => r.pattern === "bennu coffee" && r.createdFrom === "correction")).toBe(true);
});

it("doesn't offer anything once a rule exists or when clearing a category", async () => {
  await alwaysCategorize(t.db, A, { merchant: "Bennu Coffee", categoryId: coffee.id });
  expect((await chooseCategory(t.db, A, bennu1, coffee.id)).learned).toBeNull();
  expect((await chooseCategory(t.db, A, bennu2, null)).learned).toBeNull();
});

it("'Always' creates a rule and re-labels matching automatic rows", async () => {
  expect((await alwaysCategorize(t.db, A, { merchant: "Bennu Coffee", categoryId: coffee.id })).applied).toBe(2);
  const rows = await t.db.select().from(transactions).where(eq(transactions.rawDescription, "Bennu Coffee"));
  expect(rows.every((r) => r.categoryId === coffee.id && r.categorizationSource === "rule")).toBe(true);
});

it("marks bulk-categorized rows as your choice", async () => {
  expect(await setCategoryBulk(t.db, A, [bennu1, bennu2], coffee.id)).toBe(2);
  const rows = await t.db.select().from(transactions).where(eq(transactions.rawDescription, "Bennu Coffee"));
  expect(rows.every((r) => r.categorizationSource === "user" && !r.needsReview)).toBe(true);
  const log = await t.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.userId, A), eq(activityLog.action, "transaction.bulk_categorize")));
  expect(log).toHaveLength(2);
});

it("isolates users", async () => {
  await expect(chooseCategory(t.db, B, bennu1, coffee.id)).rejects.toThrow(NotFoundError);
  await expect(alwaysCategorize(t.db, B, { merchant: "Bennu Coffee", categoryId: coffee.id })).rejects.toThrow(NotFoundError);
});
