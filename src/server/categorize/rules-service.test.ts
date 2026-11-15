import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { transactions } from "@/server/db/schema";
import { createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import { applyRuleToExisting, createRule, deleteRule, listRules } from "./rules-service";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

const category = async (user: string, name: string) => (await listCategories(t.db, user)).find((c) => c.name === name)!;

it("seeds built-in rules once, and a deleted one stays deleted", async () => {
  const first = await listRules(t.db, A);
  const starbucks = first.find((x) => x.pattern === "starbucks")!;
  expect(starbucks.categoryName).toBe("Coffee");
  expect(starbucks.createdFrom).toBe("default");
  await deleteRule(t.db, A, starbucks.id);
  expect((await listRules(t.db, A)).some((x) => x.pattern === "starbucks")).toBe(false);
});

it("applies a new rule to matching rows but never to the user's own choices", async () => {
  const acct = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
  const auto = await insertTestTransaction(t.db, A, acct.id, { amountCents: -625, description: "Bennu Coffee" });
  const mine = await insertTestTransaction(t.db, A, acct.id, { amountCents: -625, description: "Bennu Coffee" });
  const restaurants = await category(A, "Restaurants");
  await t.db.update(transactions).set({ merchant: "Bennu Coffee" }).where(eq(transactions.userId, A));
  await t.db.update(transactions).set({ categoryId: restaurants.id, categorizationSource: "user" }).where(eq(transactions.id, mine.id));

  const coffee = await category(A, "Coffee");
  const rule = await createRule(t.db, A, { matchType: "merchant_equals", pattern: "bennu coffee", categoryId: coffee.id, createdFrom: "user" });
  expect(await applyRuleToExisting(t.db, A, rule.id)).toBe(1);

  const rows = await t.db.select().from(transactions).where(eq(transactions.userId, A));
  expect(rows.find((x) => x.id === auto.id)).toMatchObject({ categoryId: coffee.id, categorizationSource: "rule", needsReview: false });
  expect(rows.find((x) => x.id === mine.id)).toMatchObject({ categoryId: restaurants.id, categorizationSource: "user" });
});

it("rejects a rule for another user's category and an invalid regex", async () => {
  const theirs = await category(B, "Coffee");
  await expect(createRule(t.db, A, { matchType: "description_contains", pattern: "x", categoryId: theirs.id, createdFrom: "user" })).rejects.toThrow(NotFoundError);
  const mine = await category(A, "Coffee");
  await expect(createRule(t.db, A, { matchType: "regex", pattern: "(", categoryId: mine.id, createdFrom: "user" })).rejects.toThrow(ValidationError);
  await expect(createRule(t.db, A, { matchType: "description_contains", pattern: "  ", categoryId: mine.id, createdFrom: "user" })).rejects.toThrow(/pattern/i);
});

it("updates the category when the same rule is added again", async () => {
  const coffee = await category(A, "Coffee");
  const bars = await category(A, "Bars");
  const first = await createRule(t.db, A, { matchType: "description_contains", pattern: "haymaker", categoryId: coffee.id, createdFrom: "user" });
  const second = await createRule(t.db, A, { matchType: "description_contains", pattern: "HAYMAKER", categoryId: bars.id, createdFrom: "user" });
  expect(second.id).toBe(first.id);
  expect((await listRules(t.db, A)).find((x) => x.id === first.id)!.categoryName).toBe("Bars");
});

it("isolates users", async () => {
  const coffee = await category(A, "Coffee");
  const rule = await createRule(t.db, A, { matchType: "description_contains", pattern: "bennu", categoryId: coffee.id, createdFrom: "user" });
  await expect(deleteRule(t.db, B, rule.id)).rejects.toThrow(NotFoundError);
  expect((await listRules(t.db, B)).every((x) => x.userId === B)).toBe(true);
});
