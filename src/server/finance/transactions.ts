import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { parseDateValue } from "@/lib/dates";
import { accounts, categories, type TransactionSource, transactions } from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { type ActivityEntry, listActivity, logActivity } from "./activity";
import { NotFoundError, ValidationError } from "./errors";

export type TransactionFilters = {
  search?: string;
  accountId?: string;
  categoryId?: string | "uncategorized";
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

export type TransactionRow = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
  source: TransactionSource;
  status: string;
};

type Cursor = { date: string; createdAt: string; id: string };

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
    if (typeof c.date === "string" && typeof c.createdAt === "string" && typeof c.id === "string") return c;
  } catch {
    // fall through
  }
  throw new ValidationError("Invalid page cursor");
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const rowSelect = {
  id: transactions.id,
  date: transactions.date,
  amountCents: transactions.amountCents,
  description: transactions.rawDescription,
  accountId: transactions.accountId,
  accountName: accounts.name,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  notes: transactions.notes,
  source: transactions.source,
  status: transactions.status,
  // Exact text from Postgres (microseconds, no timezone conversion) for the cursor;
  // a JS Date would round to milliseconds and drift with the server's timezone.
  createdAt: sql<string>`${transactions.createdAt}::text`,
};

async function getRow(db: Executor, userId: string, id: string) {
  const [row] = await db
    .select(rowSelect)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!row) throw new NotFoundError("Transaction");
  return row;
}

const toRow = ({ createdAt: _createdAt, ...r }: Awaited<ReturnType<typeof getRow>>): TransactionRow => r;

async function assertCategory(db: Executor, userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [c] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
  if (!c) throw new NotFoundError("Category");
}

/** Newest first, filtered, cursor-paginated. */
export async function listTransactions(
  db: Database,
  userId: string,
  f: TransactionFilters,
): Promise<{ items: TransactionRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
  const where: SQL[] = [eq(transactions.userId, userId)];
  if (f.search?.trim()) {
    const q = `%${escapeLike(f.search.trim())}%`;
    where.push(or(ilike(transactions.rawDescription, q), ilike(transactions.notes, q))!);
  }
  if (f.accountId) where.push(eq(transactions.accountId, f.accountId));
  if (f.categoryId === "uncategorized") where.push(isNull(transactions.categoryId));
  else if (f.categoryId) where.push(eq(transactions.categoryId, f.categoryId));
  if (f.from) where.push(gte(transactions.date, f.from));
  if (f.to) where.push(lte(transactions.date, f.to));
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    where.push(
      sql`(${transactions.date}, ${transactions.createdAt}, ${transactions.id}) < (${c.date}::date, ${c.createdAt}::timestamp, ${c.id})`,
    );
  }

  const rows = await db
    .select(rowSelect)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...where))
    .orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({ date: last.date, createdAt: last.createdAt, id: last.id })
      : null;
  return { items: page.map(toRow), nextCursor };
}

/** Adds a transaction by hand (cash, or anything not in a bank file). */
export async function createManualTransaction(
  db: Database,
  userId: string,
  input: { accountId: string; date: string; description: string; amountCents: number; categoryId?: string | null; notes?: string | null },
): Promise<TransactionRow> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
  if (!account) throw new NotFoundError("Account");
  if (parseDateValue(input.date, "YYYY-MM-DD") === null) throw new ValidationError("Enter a valid date");
  const description = input.description.trim();
  if (!description) throw new ValidationError("Description is required");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new ValidationError("Enter an amount");
  await assertCategory(db, userId, input.categoryId);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(transactions)
      .values({
        userId,
        accountId: input.accountId,
        date: input.date,
        amountCents: input.amountCents,
        rawDescription: description,
        categoryId: input.categoryId ?? null,
        notes: input.notes?.trim() || null,
        source: "manual",
        dedupeHash: `manual:${randomUUID()}`,
      })
      .returning({ id: transactions.id });
    const row = toRow(await getRow(tx, userId, created!.id));
    await logActivity(tx, { userId, actor: "user", action: "transaction.create", entityType: "transaction", entityId: row.id, after: row });
    return row;
  });
}

/** Edits a transaction. Imported rows keep the bank's date and amount. */
export async function updateTransaction(
  db: Database,
  userId: string,
  id: string,
  patch: { categoryId?: string | null; notes?: string | null; description?: string; date?: string; amountCents?: number },
): Promise<TransactionRow> {
  const before = await getRow(db, userId, id);
  if ((patch.date !== undefined || patch.amountCents !== undefined) && before.source !== "manual") {
    throw new ValidationError("Imported amounts and dates can't be edited");
  }
  if (patch.date !== undefined && parseDateValue(patch.date, "YYYY-MM-DD") === null) throw new ValidationError("Enter a valid date");
  if (patch.description !== undefined && !patch.description.trim()) throw new ValidationError("Description is required");
  await assertCategory(db, userId, patch.categoryId);

  const values: Partial<typeof transactions.$inferInsert> = {};
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
  if (patch.notes !== undefined) values.notes = patch.notes?.trim() || null;
  if (patch.description !== undefined) values.rawDescription = patch.description.trim();
  if (patch.date !== undefined) values.date = patch.date;
  if (patch.amountCents !== undefined) values.amountCents = patch.amountCents;

  return db.transaction(async (tx) => {
    await tx.update(transactions).set(values).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    const after = toRow(await getRow(tx, userId, id));
    await logActivity(tx, {
      userId,
      actor: "user",
      action: "transaction.update",
      entityType: "transaction",
      entityId: id,
      before: toRow(before),
      after,
    });
    return after;
  });
}

/** Sets one category on many transactions; ids that aren't the user's are ignored. */
export async function setCategoryBulk(
  db: Database,
  userId: string,
  ids: string[],
  categoryId: string | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  const owned = await db
    .select({ id: transactions.id, categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
  if (owned.length === 0) return 0;
  await assertCategory(db, userId, categoryId);
  const changed = owned.filter((r) => r.categoryId !== categoryId);
  if (changed.length === 0) return 0;

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ categoryId })
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, changed.map((r) => r.id))));
    for (const r of changed) {
      await logActivity(tx, {
        userId,
        actor: "user",
        action: "transaction.bulk_categorize",
        entityType: "transaction",
        entityId: r.id,
        before: { categoryId: r.categoryId },
        after: { categoryId },
      });
    }
  });
  return changed.length;
}

/** Deletes a hand-added transaction. Imported rows go away by undoing their import. */
export async function deleteTransaction(db: Database, userId: string, id: string): Promise<void> {
  const before = await getRow(db, userId, id);
  if (before.source !== "manual") {
    throw new ValidationError("Imported transactions can't be deleted. Undo the import instead.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "transaction.delete", entityType: "transaction", entityId: id, before: toRow(before) });
  });
}

/** Changes to one transaction, newest first. */
export async function getTransactionHistory(db: Database, userId: string, id: string): Promise<ActivityEntry[]> {
  await getRow(db, userId, id);
  return listActivity(db, userId, "transaction", id);
}
