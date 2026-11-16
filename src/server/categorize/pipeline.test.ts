import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AiUsageTokens } from "@/server/ai/config";
import { recordAiUsage } from "@/server/ai/usage";
import { activityLog, aiUsage, transactions } from "@/server/db/schema";
import { type Account, createAccount } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { setTrackingStartDate } from "@/server/finance/settings";
import { createTestDb } from "@/test/db";
import { createTestUser, insertTestTransaction } from "@/test/users";
import type { AiCategorizer, AiItem } from "./ai-categorizer";
import { createManualTransaction } from "@/server/finance/transactions";
import { categorizeTransactions, countUnsorted, sortTransactions } from "./pipeline";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let acct: Account;
let aiCalls: { items: AiItem[]; examples: { merchant: string; categoryName: string }[] }[];
const now = new Date("2026-11-20T12:00:00Z");
const tokens = (inputTokens: number, outputTokens: number): AiUsageTokens => ({ inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 });

/** Returns map[merchant] at the given confidence (default 0.95); unmapped merchants get unknown. */
const fakeAi = (map: Record<string, string | [string, number]>): AiCategorizer => async ({ categories, examples, items }) => {
  aiCalls.push({ items, examples });
  const idOf = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
  return {
    model: "claude-haiku-5-5",
    usage: tokens(1000, 100),
    results: items.map((i) => {
      const hit = map[i.merchant];
      if (!hit) return { ref: i.ref, categoryId: null, confidence: 0 };
      const [name, confidence] = Array.isArray(hit) ? hit : [hit, 0.95];
      return { ref: i.ref, categoryId: idOf(name), confidence };
    }),
  };
};

const add = (merchant: string, opts: { amountCents?: number; bankCategory?: string } = {}) =>
  insertTestTransaction(t.db, A, acct.id, { amountCents: opts.amountCents ?? -500, date: "2026-11-10", description: merchant }).then(
    async (r) => {
      await t.db.update(transactions).set({ merchant, bankCategory: opts.bankCategory ?? null }).where(eq(transactions.id, r.id));
      return r;
    },
  );
const get = async (id: string) => (await t.db.select().from(transactions).where(eq(transactions.id, id)))[0]!;
const cat = async (name: string) => (await listCategories(t.db, A)).find((c) => c.name === name)!;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  aiCalls = [];
  await setTrackingStartDate(t.db, A, "2026-11-01");
  acct = await createAccount(t.db, A, { name: "Checking", type: "checking", startingBalanceCents: 0 });
});
afterEach(async () => {
  await t.close();
});

it("uses rules, then your past choices, then the AI", async () => {
  const coffee = await cat("Coffee");
  const past = await add("Bennu Coffee");
  await t.db.update(transactions).set({ categoryId: coffee.id, categorizationSource: "user" }).where(eq(transactions.id, past.id));
  const starbucks = await add("Starbucks");
  const bennu = await add("Bennu Coffee");
  const haymaker = await add("Haymaker");

  const s = await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ Haymaker: "Restaurants" }), now });
  expect(s).toEqual({ byRule: 1, byHistory: 1, byAi: 1, needsReview: 0 });
  expect(aiCalls[0]!.items.map((i) => i.merchant)).toEqual(["Haymaker"]);
  expect(aiCalls[0]!.examples).toEqual([{ merchant: "Bennu Coffee", categoryName: "Coffee" }]);
  expect(await get(starbucks.id)).toMatchObject({ categoryId: coffee.id, categorizationSource: "rule" });
  expect(await get(bennu.id)).toMatchObject({ categoryId: coffee.id, categorizationSource: "history" });
  expect(await get(haymaker.id)).toMatchObject({ categoryId: (await cat("Restaurants")).id, categorizationSource: "ai", needsReview: false });
});

it("sends low-confidence guesses to review with the guess kept", async () => {
  const row = await add("Mystery Shop");
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ "Mystery Shop": ["Coffee", 0.4] }), now });
  expect(await get(row.id)).toMatchObject({ categoryId: (await cat("Coffee")).id, categorizationSource: "ai", needsReview: true });
});

it("never touches rows the user categorized", async () => {
  const gifts = await cat("Gifts");
  const coffee = await cat("Coffee");
  const history = await add("Starbucks");
  await t.db.update(transactions).set({ categoryId: coffee.id, categorizationSource: "user" }).where(eq(transactions.id, history.id));
  const mine = await add("Starbucks");
  await t.db.update(transactions).set({ categoryId: gifts.id, categorizationSource: "user" }).where(eq(transactions.id, mine.id));
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ Starbucks: "Bars" }), now });
  await sortTransactions(t.db, A, { ai: fakeAi({ Starbucks: "Bars" }), now });
  expect(await get(mine.id)).toMatchObject({ categoryId: gifts.id, categorizationSource: "user" });
});

it("skips AI when no key or over the monthly cap", async () => {
  await add("Haymaker");
  expect((await categorizeTransactions(t.db, A, { pending: true }, { ai: null, now })).needsReview).toBe(1);
  await recordAiUsage(t.db, A, { purpose: "categorize", model: "claude-haiku-5-5", usage: tokens(100_000_000, 0) });
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ Haymaker: "Restaurants" }), now });
  expect(aiCalls).toHaveLength(0);
});

it("an AI error leaves the rows for review", async () => {
  const row = await add("Haymaker");
  const boom: AiCategorizer = async () => {
    throw new Error("network down");
  };
  expect((await categorizeTransactions(t.db, A, { pending: true }, { ai: boom, now })).needsReview).toBe(1);
  expect(await get(row.id)).toMatchObject({ needsReview: true, categoryId: null });
});

it("records AI usage for each call", async () => {
  await add("Haymaker");
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ Haymaker: "Restaurants" }), now });
  const rows = await t.db.select().from(aiUsage).where(eq(aiUsage.userId, A));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ purpose: "categorize", model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 100 });
});

it("passes the bank's category to the AI as a hint", async () => {
  await add("Haymaker", { bankCategory: "Food & Dining" });
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({}), now });
  expect(aiCalls[0]!.items[0]!.bankCategory).toBe("Food & Dining");
});

it("splits large sets into batches of 50", async () => {
  for (let i = 0; i < 120; i++) await add(`Shop ${i}`);
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({}), now });
  expect(aiCalls.map((c) => c.items.length).sort((a, b) => b - a)).toEqual([50, 50, 20]);
});

it("backfills merchants, transfers and categories for rows imported before 1b", async () => {
  const other = await createAccount(t.db, A, { name: "Savings", type: "savings", startingBalanceCents: 0 });
  const prime = await insertTestTransaction(t.db, A, acct.id, { amountCents: -2164, date: "2026-11-14", description: "Prime Video" });
  const out = await insertTestTransaction(t.db, A, acct.id, { amountCents: -10000, date: "2026-11-12", description: "Withdrawal Internet Banking Transfer To Share 0001" });
  const inn = await insertTestTransaction(t.db, A, other.id, { amountCents: 10000, date: "2026-11-12", description: "Deposit Internet Banking Transfer From Share 0080" });
  const s = await sortTransactions(t.db, A, { ai: null, now });
  expect(s).toMatchObject({ transfers: 1, byRule: 1 });
  expect(s.merchantsFilled).toBe(3);
  expect(await get(prime.id)).toMatchObject({ merchant: "Prime Video", categoryId: (await cat("Subscriptions")).id });
  expect((await get(out.id)).transferPairId).toBe((await get(inn.id)).transferPairId);
});

it("Sort now doesn't re-send rows the AI already looked at", async () => {
  const row = await add("Mystery Shop");
  await t.db.update(transactions).set({ categorizationSource: "ai", needsReview: true, categorizationConfidence: 0.3 }).where(eq(transactions.id, row.id));
  await sortTransactions(t.db, A, { ai: fakeAi({}), now });
  expect(aiCalls).toHaveLength(0);
});

it("Sort now offers rows that never reached the AI once a key exists", async () => {
  const row = await add("Haymaker");
  await t.db.update(transactions).set({ categorizationSource: null, needsReview: true }).where(eq(transactions.id, row.id));
  await sortTransactions(t.db, A, { ai: fakeAi({ Haymaker: "Restaurants" }), now });
  expect(aiCalls).toHaveLength(1);
});

it("ignores rows before the tracking start date", async () => {
  const early = await insertTestTransaction(t.db, A, acct.id, { amountCents: -500, date: "2026-10-20", description: "Haymaker" });
  expect(await countUnsorted(t.db, A)).toBe(0);
  await sortTransactions(t.db, A, { ai: fakeAi({ Haymaker: "Restaurants" }), now });
  expect(aiCalls).toHaveLength(0);
  expect(await get(early.id)).toMatchObject({ categorizationSource: null, categoryId: null });
});

it("sorts a new cash entry when it's added", async () => {
  const starbucks = await createManualTransaction(t.db, A, { accountId: acct.id, date: "2026-11-10", description: "Starbucks", amountCents: -500 });
  const unknown = await createManualTransaction(t.db, A, { accountId: acct.id, date: "2026-11-10", description: "Haymaker", amountCents: -900 });
  expect(await get(starbucks.id)).toMatchObject({ categoryId: (await cat("Coffee")).id, categorizationSource: "rule" });
  expect(await get(unknown.id)).toMatchObject({ needsReview: true });
  expect(await countUnsorted(t.db, A)).toBe(0);
});

it("does not overwrite a choice made while sorting was running", async () => {
  const gifts = await cat("Gifts");
  const row = await add("Haymaker");
  const racing: AiCategorizer = async (input) => {
    // Another device: the user picks a category while the AI call is in flight.
    await t.db.update(transactions).set({ categoryId: gifts.id, categorizationSource: "user" }).where(eq(transactions.id, row.id));
    return fakeAi({ Haymaker: ["Coffee", 0.9] })(input);
  };
  await categorizeTransactions(t.db, A, { pending: true }, { ai: racing, now });
  expect(await get(row.id)).toMatchObject({ categoryId: gifts.id, categorizationSource: "user" });
  const log = await t.db.select().from(activityLog).where(and(eq(activityLog.entityId, row.id), eq(activityLog.action, "transaction.auto_categorize")));
  expect(log).toHaveLength(0);
});

it("an AI 'unknown' keeps the earlier guess", async () => {
  const coffee = await cat("Coffee");
  const row = await add("Mystery Shop");
  await t.db.update(transactions).set({ categoryId: coffee.id }).where(eq(transactions.id, row.id));
  await categorizeTransactions(t.db, A, { pending: true }, { ai: fakeAi({ "Mystery Shop": ["Nonexistent", 0.2] }), now });
  expect(await get(row.id)).toMatchObject({ categoryId: coffee.id, needsReview: true, categorizationSource: "ai" });
});
