"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import {
  createManualTransaction,
  deleteTransaction,
  getTransactionHistory,
  listTransactions,
  setCategoryBulk,
  setHidden,
  type TransactionFilters,
  type TransactionRow,
  updateTransaction,
} from "@/server/finance/transactions";

type Failure = { error: string };

function toFailure(err: unknown): Failure {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Something about that input wasn't valid" };
  throw err;
}

const filtersSchema = z.object({
  search: z.string().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  includeHidden: z.boolean().optional(),
});

export async function loadMore(filters: TransactionFilters): Promise<{ items: TransactionRow[]; nextCursor: string | null } | Failure> {
  const user = await requireUser();
  try {
    return await listTransactions(getDb(), user.id, filtersSchema.parse(filters));
  } catch (err) {
    return toFailure(err);
  }
}

export async function setCategory(id: string, categoryId: string | null): Promise<TransactionRow | Failure> {
  const user = await requireUser();
  try {
    const row = await updateTransaction(getDb(), user.id, z.string().parse(id), { categoryId: z.string().nullable().parse(categoryId) });
    revalidatePath("/transactions");
    return row;
  } catch (err) {
    return toFailure(err);
  }
}

export async function bulkCategorize(ids: string[], categoryId: string | null): Promise<{ changed: number } | Failure> {
  const user = await requireUser();
  try {
    const changed = await setCategoryBulk(getDb(), user.id, z.array(z.string()).max(1000).parse(ids), z.string().nullable().parse(categoryId));
    revalidatePath("/transactions");
    return { changed };
  } catch (err) {
    return toFailure(err);
  }
}

const addSchema = z.object({
  accountId: z.string().min(1),
  date: z.string(),
  description: z.string(),
  amount: z.string(),
  direction: z.enum(["out", "in"]),
});

export async function addTransaction(formData: FormData): Promise<TransactionRow | Failure> {
  const user = await requireUser();
  try {
    const input = addSchema.parse(Object.fromEntries(formData));
    const cents = parseAmountToCents(input.amount);
    if (cents === null || cents <= 0) return { error: "Enter the amount as a positive number, like 18.50" };
    const row = await createManualTransaction(getDb(), user.id, {
      accountId: input.accountId,
      date: input.date,
      description: input.description,
      amountCents: input.direction === "out" ? -cents : cents,
    });
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return row;
  } catch (err) {
    return toFailure(err);
  }
}

export async function saveNotes(id: string, notes: string): Promise<TransactionRow | Failure> {
  const user = await requireUser();
  try {
    const row = await updateTransaction(getDb(), user.id, z.string().parse(id), { notes: z.string().max(2000).parse(notes) });
    revalidatePath("/transactions");
    return row;
  } catch (err) {
    return toFailure(err);
  }
}

export async function setHiddenAction(id: string, hidden: boolean): Promise<TransactionRow | Failure> {
  const user = await requireUser();
  try {
    const row = await setHidden(getDb(), user.id, z.string().parse(id), z.boolean().parse(hidden));
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return row;
  } catch (err) {
    return toFailure(err);
  }
}

export async function removeTransaction(id: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await deleteTransaction(getDb(), user.id, z.string().parse(id));
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

export type HistoryItem = { id: string; label: string; at: string };

const LABELS: Record<string, string> = {
  "transaction.create": "Added by hand",
  "transaction.bulk_categorize": "Category changed",
  "transaction.delete": "Deleted",
  "transaction.hide": "Hidden as a duplicate",
  "transaction.unhide": "Unhidden",
};

function labelFor(action: string, before: unknown, after: unknown): string {
  if (LABELS[action]) return LABELS[action];
  if (action === "transaction.update") {
    const b = (before ?? {}) as Record<string, unknown>;
    const a = (after ?? {}) as Record<string, unknown>;
    if (b.categoryId !== a.categoryId) return "Category changed";
    if (b.notes !== a.notes) return "Notes changed";
    return "Edited";
  }
  return action;
}

export async function getHistory(id: string): Promise<HistoryItem[] | Failure> {
  const user = await requireUser();
  try {
    const entries = await getTransactionHistory(getDb(), user.id, z.string().parse(id));
    const items = entries.map((e) => ({ id: e.id, label: labelFor(e.action, e.before, e.after), at: e.createdAt.toISOString() }));
    return items;
  } catch (err) {
    return toFailure(err);
  }
}
