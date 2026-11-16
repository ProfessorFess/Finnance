import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { daysBetween } from "@/lib/dates";
import { activityLog, incomeSources, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { createManualTransaction } from "@/server/finance/transactions";
import { matchesPattern } from "./match";
import { linkTransaction } from "./matching-service";
import { defaultToleranceCents, MATCH_WINDOW_DAYS } from "./schedule";

/**
 * Records income that isn't in a bank file ("I got paid $340 today") and links
 * it to its source, so plans and Recurring count it like any other deposit.
 */
export async function logIncome(
  db: Database,
  userId: string,
  input: { incomeSourceId: string; accountId: string; date: string; amountCents: number; note?: string },
): Promise<{ transactionId: string }> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ValidationError("Enter an amount above $0");
  const [source] = await db
    .select()
    .from(incomeSources)
    .where(and(eq(incomeSources.id, input.incomeSourceId), eq(incomeSources.userId, userId)));
  if (!source) throw new NotFoundError("Income source");
  const row = await createManualTransaction(db, userId, {
    accountId: input.accountId,
    date: input.date,
    description: source.name,
    amountCents: input.amountCents,
    categoryId: source.categoryId,
    notes: input.note ?? null,
  });
  await linkTransaction(db, userId, row.id, { kind: "income", id: source.id });
  await logActivity(db, { userId, actor: "user", action: "income.log", entityType: "transaction", entityId: row.id, after: { incomeSourceId: source.id, amountCents: input.amountCents, date: input.date } });
  return { transactionId: row.id };
}

/**
 * When the bank's record of a deposit arrives, it replaces income the user
 * logged by hand for it (same source, ±3 days, a close amount), so it counts once.
 * The deposit takes over the logged row's link; the logged row is hidden.
 */
export async function supersedeLoggedIncome(db: Database, userId: string, insertedIds: string[]): Promise<number> {
  if (insertedIds.length === 0) return 0;
  const deposits = await db
    .select({ id: transactions.id, date: transactions.date, amountCents: transactions.amountCents, accountId: transactions.accountId, description: transactions.rawDescription, merchant: transactions.merchant })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, insertedIds)));
  const incoming = deposits.filter((d) => d.amountCents > 0);
  if (incoming.length === 0) return 0;

  const logged = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      accountId: transactions.accountId,
      incomeSourceId: transactions.incomeSourceId,
      expectedDate: transactions.expectedDate,
      matchSource: transactions.matchSource,
      pattern: incomeSources.matchPattern,
      sourceAccountId: incomeSources.accountId,
    })
    .from(transactions)
    .innerJoin(incomeSources, eq(incomeSources.id, transactions.incomeSourceId))
    .where(and(eq(transactions.userId, userId), eq(transactions.source, "manual"), ne(transactions.status, "excluded"), isNotNull(transactions.incomeSourceId)));
  if (logged.length === 0) return 0;

  const pairs: { deposit: (typeof incoming)[number]; log: (typeof logged)[number]; dist: number }[] = [];
  for (const d of incoming) {
    for (const l of logged) {
      const dist = Math.abs(daysBetween(l.date, d.date));
      if (dist > MATCH_WINDOW_DAYS) continue;
      if (l.accountId !== d.accountId) continue;
      if (Math.abs(d.amountCents - l.amountCents) > defaultToleranceCents(l.amountCents)) continue;
      if (!matchesPattern(l.pattern, { description: d.description, merchant: d.merchant })) continue;
      pairs.push({ deposit: d, log: l, dist });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist || a.deposit.id.localeCompare(b.deposit.id));

  const usedDeposits = new Set<string>();
  const usedLogs = new Set<string>();
  let replaced = 0;
  await db.transaction(async (tx) => {
    for (const p of pairs) {
      if (usedDeposits.has(p.deposit.id) || usedLogs.has(p.log.id)) continue;
      usedDeposits.add(p.deposit.id);
      usedLogs.add(p.log.id);
      await tx
        .update(transactions)
        .set({ status: "excluded", incomeSourceId: null, recurringRuleId: null, expectedDate: null, matchSource: null })
        .where(and(eq(transactions.id, p.log.id), eq(transactions.userId, userId)));
      await tx
        .update(transactions)
        .set({ incomeSourceId: p.log.incomeSourceId, expectedDate: p.log.expectedDate, matchSource: p.log.matchSource })
        .where(and(eq(transactions.id, p.deposit.id), eq(transactions.userId, userId)));
      await tx.insert(activityLog).values([
        { userId, actor: "system" as const, action: "transaction.superseded", entityType: "transaction", entityId: p.log.id, after: { replacedBy: p.deposit.id } },
        { userId, actor: "system" as const, action: "transaction.superseded", entityType: "transaction", entityId: p.deposit.id, after: { replaces: p.log.id } },
      ]);
      replaced++;
    }
  });
  return replaced;
}
