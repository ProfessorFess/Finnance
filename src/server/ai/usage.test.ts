import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { aiUsage } from "@/server/db/schema";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { type AiUsageTokens, costMicros } from "./config";
import { canSpendAi, getMonthAiSpendMicros, recordAiUsage } from "./usage";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;
const now = new Date("2026-11-20T12:00:00Z");
const tokens = (inputTokens: number, outputTokens: number): AiUsageTokens => ({
  inputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

it("prices Haiku usage in micro-dollars", () => {
  expect(costMicros("claude-haiku-5-5", tokens(1_000_000, 0))).toBe(100_000);
  expect(
    costMicros("claude-haiku-5-5", { inputTokens: 2_000, outputTokens: 1_000, cacheReadTokens: 10_000, cacheWriteTokens: 0 }),
  ).toBe(200 + 500 + 100);
});

it("sums this month's spend only", async () => {
  await recordAiUsage(t.db, A, { purpose: "categorize", model: "claude-haiku-5-5", usage: tokens(1_000_000, 0) });
  await t.db.update(aiUsage).set({ createdAt: new Date("2026-10-15T12:00:00Z") }).where(eq(aiUsage.userId, A));
  await recordAiUsage(t.db, A, { purpose: "categorize", model: "claude-haiku-5-5", usage: tokens(2_000, 1_000) });
  expect(await getMonthAiSpendMicros(t.db, A, now)).toBe(700);
});

it("stops spending at the monthly cap ($10 default)", async () => {
  expect(await canSpendAi(t.db, A, now)).toBe(true);
  await recordAiUsage(t.db, A, { purpose: "categorize", model: "claude-haiku-5-5", usage: tokens(100_000_000, 0) });
  expect(await canSpendAi(t.db, A, now)).toBe(false);
});

it("isolates users", async () => {
  await recordAiUsage(t.db, A, { purpose: "categorize", model: "claude-haiku-5-5", usage: tokens(100_000_000, 0) });
  expect(await canSpendAi(t.db, B, now)).toBe(true);
});
