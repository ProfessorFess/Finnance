import { randomUUID } from "node:crypto";
import type { Database } from "@/server/db/types";
import { transactions, user } from "@/server/db/schema";

/** Inserts a bare user row (no login) for service tests. */
export async function createTestUser(db: Database, email = `${randomUUID()}@test.local`): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(user).values({ id, name: "Test User", email, emailVerified: true });
  return { id };
}

/** Inserts a transaction directly, bypassing services (for balance/list setups). */
export async function insertTestTransaction(
  db: Database,
  userId: string,
  accountId: string,
  opts: { amountCents: number; date?: string; description?: string },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(transactions)
    .values({
      userId,
      accountId,
      amountCents: opts.amountCents,
      date: opts.date ?? "2026-11-10",
      rawDescription: opts.description ?? "Test transaction",
      source: "manual",
      dedupeHash: `test:${randomUUID()}`,
    })
    .returning({ id: transactions.id });
  return row!;
}
