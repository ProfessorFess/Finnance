import { and, asc, eq, isNull, max, sum } from "drizzle-orm";
import { type AccountType, accounts, importBatches, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "./activity";
import { NotFoundError, ValidationError } from "./errors";

export type Account = typeof accounts.$inferSelect;
export type AccountWithBalance = Account & { balanceCents: number; lastImportAt: Date | null };

export type AccountInput = {
  name: string;
  type: AccountType;
  institution?: string | null;
  lastFour?: string | null;
  startingBalanceCents: number;
};

export const ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "credit_card", "cash", "loan", "investment", "other"];

function clean(input: Partial<AccountInput>): Partial<AccountInput> {
  const out: Partial<AccountInput> = { ...input };
  if (input.name !== undefined) {
    out.name = input.name.trim();
    if (!out.name) throw new ValidationError("Account name is required");
  }
  if (input.type !== undefined && !ACCOUNT_TYPES.includes(input.type)) throw new ValidationError("Unknown account type");
  if (input.institution !== undefined) out.institution = input.institution?.trim() || null;
  if (input.lastFour !== undefined) {
    out.lastFour = input.lastFour?.trim() || null;
    if (out.lastFour !== null && !/^\d{4}$/.test(out.lastFour)) {
      throw new ValidationError("Last four must be exactly 4 digits");
    }
  }
  if (input.startingBalanceCents !== undefined && !Number.isSafeInteger(input.startingBalanceCents)) {
    throw new ValidationError("Starting balance must be a whole number of cents");
  }
  return out;
}

async function getOwned(db: Database, userId: string, id: string): Promise<Account> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  if (!row) throw new NotFoundError("Account");
  return row;
}

export async function createAccount(db: Database, userId: string, input: AccountInput): Promise<Account> {
  const values = clean(input) as AccountInput;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(accounts)
      .values({ ...values, userId })
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "account.create", entityType: "account", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updateAccount(
  db: Database,
  userId: string,
  id: string,
  patch: Partial<AccountInput>,
): Promise<Account> {
  const before = await getOwned(db, userId, id);
  const values = clean(patch);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(accounts)
      .set(values)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "account.update", entityType: "account", entityId: id, before, after: row });
    return row!;
  });
}

export async function archiveAccount(db: Database, userId: string, id: string): Promise<void> {
  const before = await getOwned(db, userId, id);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(accounts)
      .set({ archivedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "account.archive", entityType: "account", entityId: id, before, after: row });
  });
}

/** Accounts with balance = starting balance + all their transactions, and the last import time. */
export async function listAccounts(
  db: Database,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const where = opts.includeArchived
    ? eq(accounts.userId, userId)
    : and(eq(accounts.userId, userId), isNull(accounts.archivedAt));
  const rows = await db.select().from(accounts).where(where).orderBy(asc(accounts.createdAt), asc(accounts.name));

  const sums = await db
    .select({ accountId: transactions.accountId, total: sum(transactions.amountCents).mapWith(Number) })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(transactions.accountId);
  const imports = await db
    .select({ accountId: importBatches.accountId, last: max(importBatches.createdAt) })
    .from(importBatches)
    .where(and(eq(importBatches.userId, userId), isNull(importBatches.undoneAt)))
    .groupBy(importBatches.accountId);

  const totalBy = new Map(sums.map((s) => [s.accountId, s.total ?? 0]));
  const lastBy = new Map(imports.map((i) => [i.accountId, i.last]));
  return rows.map((a) => ({
    ...a,
    balanceCents: a.startingBalanceCents + (totalBy.get(a.id) ?? 0),
    lastImportAt: lastBy.get(a.id) ?? null,
  }));
}
