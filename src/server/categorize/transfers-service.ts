import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { activityLog, NOT_A_TRANSFER, transactions } from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { listCategories } from "@/server/finance/categories";
import { NotFoundError } from "@/server/finance/errors";
import { pairTransfers } from "./transfers";

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function transferCategoryId(db: Database, userId: string): Promise<string | null> {
  return (await listCategories(db, userId)).find((c) => c.name === "Transfer")?.id ?? null;
}

/**
 * Finds and links transfers between the user's own accounts. Skips hidden rows,
 * rows already paired or marked "not a transfer", and anything the user
 * categorized themselves. Returns the number of pairs made.
 */
export async function detectTransfers(db: Database, userId: string, range?: { from: string; to: string }): Promise<number> {
  const where = [
    eq(transactions.userId, userId),
    ne(transactions.status, "excluded"),
    isNull(transactions.transferPairId),
    or(isNull(transactions.categorizationSource), ne(transactions.categorizationSource, "user")),
  ];
  if (range) where.push(gte(transactions.date, shiftDays(range.from, -5)), lte(transactions.date, shiftDays(range.to, 5)));

  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.rawDescription,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(...where));
  const pairs = pairTransfers(rows);
  if (pairs.length === 0) return 0;

  const categoryId = await transferCategoryId(db, userId);
  const before = new Map(rows.map((r) => [r.id, r.categoryId]));
  await db.transaction(async (tx) => {
    for (const [outId, inId] of pairs) {
      const pairId = randomUUID();
      await tx
        .update(transactions)
        .set({ transferPairId: pairId, categoryId, categorizationSource: "transfer", categorizationConfidence: null, needsReview: false })
        .where(and(eq(transactions.userId, userId), inArray(transactions.id, [outId, inId])));
    }
    await tx.insert(activityLog).values(
      pairs.flat().map((id) => ({
        userId,
        actor: "system" as const,
        action: "transaction.transfer_pair",
        entityType: "transaction",
        entityId: id,
        before: { categoryId: before.get(id) ?? null },
        after: { categoryId, source: "transfer" },
      })),
    );
  });
  return pairs.length;
}

/** "Not a transfer": un-links both sides and keeps them from pairing again. */
export async function unpairTransfer(db: Database, userId: string, transactionId: string): Promise<void> {
  const [row] = await db
    .select({ pairId: transactions.transferPairId })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
  if (!row) throw new NotFoundError("Transaction");
  const ids =
    row.pairId && row.pairId !== NOT_A_TRANSFER
      ? (
          await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), eq(transactions.transferPairId, row.pairId)))
        ).map((r) => r.id)
      : [transactionId];

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ transferPairId: NOT_A_TRANSFER, categoryId: null, categorizationSource: null, categorizationConfidence: null, needsReview: true })
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
    for (const id of ids) {
      await logActivity(tx, { userId, actor: "user", action: "transaction.transfer_unpair", entityType: "transaction", entityId: id, before: { transferPairId: row.pairId } });
    }
  });
}

/** Resets rows whose transfer partner no longer exists (e.g. after an import was undone). */
export async function clearDanglingPairs(db: Executor, userId: string): Promise<number> {
  const lonely = await db
    .select({ pairId: transactions.transferPairId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNotNull(transactions.transferPairId), ne(transactions.transferPairId, NOT_A_TRANSFER)))
    .groupBy(transactions.transferPairId)
    .having(sql`count(*) < 2`);
  const pairIds = lonely.map((l) => l.pairId!).filter(Boolean);
  if (pairIds.length === 0) return 0;
  const reset = await db
    .update(transactions)
    .set({ transferPairId: null, categoryId: null, categorizationSource: null, categorizationConfidence: null, needsReview: true })
    .where(and(eq(transactions.userId, userId), inArray(transactions.transferPairId, pairIds)))
    .returning({ id: transactions.id });
  return reset.length;
}
