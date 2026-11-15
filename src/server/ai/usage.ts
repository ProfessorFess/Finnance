import { and, eq, sql } from "drizzle-orm";
import { aiUsage, userSettings } from "@/server/db/schema";
import type { Executor } from "@/server/db/types";
import { type AiUsageTokens, costMicros } from "./config";

/** Records one AI call's tokens and cost. */
export async function recordAiUsage(
  db: Executor,
  userId: string,
  entry: { purpose: string; model: string; usage: AiUsageTokens },
): Promise<void> {
  await db.insert(aiUsage).values({
    userId,
    purpose: entry.purpose,
    model: entry.model,
    inputTokens: entry.usage.inputTokens,
    outputTokens: entry.usage.outputTokens,
    cacheReadTokens: entry.usage.cacheReadTokens,
    cacheWriteTokens: entry.usage.cacheWriteTokens,
    costMicros: costMicros(entry.model, entry.usage),
  });
}

async function settingsFor(db: Executor, userId: string) {
  const [row] = await db
    .select({ timezone: userSettings.timezone, cap: userSettings.aiMonthlyCapCents })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return { timezone: row?.timezone ?? "America/Chicago", capCents: row?.cap ?? 1000 };
}

/**
 * AI spend in the current calendar month (in the user's timezone), in µ$.
 * created_at holds UTC wall time, so it's converted before comparing months.
 */
export async function getMonthAiSpendMicros(db: Executor, userId: string, now: Date): Promise<number> {
  const { timezone } = await settingsFor(db, userId);
  const [row] = await db
    .select({ total: sql<string | null>`sum(${aiUsage.costMicros})` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        sql`date_trunc('month', (${aiUsage.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})
            = date_trunc('month', (${now.toISOString()}::timestamptz) AT TIME ZONE ${timezone})`,
      ),
    );
  return Number(row?.total ?? 0);
}

/** Whether the month's AI spend is still under the user's cap ($10 by default). */
export async function canSpendAi(db: Executor, userId: string, now: Date): Promise<boolean> {
  const { capCents } = await settingsFor(db, userId);
  return (await getMonthAiSpendMicros(db, userId, now)) < capCents * 10_000;
}
