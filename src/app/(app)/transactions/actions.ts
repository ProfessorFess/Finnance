"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { alwaysCategorize, chooseCategory, type Learned } from "@/server/categorize/learn";
import { unpairTransfer } from "@/server/categorize/transfers-service";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import type { ItemRef } from "@/server/recurring/items-service";
import { linkTransaction } from "@/server/recurring/matching-service";
import {
  createManualTransaction,
  deleteTransaction,
  getTransactionHistory,
  getTransactionRow,
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

export async function setCategory(id: string, categoryId: string | null): Promise<{ row: TransactionRow; learned: Learned | null } | Failure> {
  const user = await requireUser();
  try {
    const res = await chooseCategory(getDb(), user.id, z.string().parse(id), z.string().nullable().parse(categoryId));
    revalidatePath("/transactions");
    return res;
  } catch (err) {
    return toFailure(err);
  }
}

export async function alwaysCategorizeAction(merchant: string, categoryId: string): Promise<{ applied: number } | Failure> {
  const user = await requireUser();
  try {
    const { applied } = await alwaysCategorize(getDb(), user.id, {
      merchant: z.string().min(1).max(200).parse(merchant),
      categoryId: z.string().parse(categoryId),
    });
    revalidatePath("/transactions");
    return { applied };
  } catch (err) {
    return toFailure(err);
  }
}

export async function notATransferAction(id: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await unpairTransfer(getDb(), user.id, z.string().parse(id));
    revalidatePath("/transactions");
    return { ok: true };
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
  "transaction.auto_categorize": "Sorted automatically",
  "transaction.transfer_pair": "Matched as a transfer",
  "transaction.transfer_unpair": "Marked as not a transfer",
  "transaction.unhide": "Unhidden",
  "transaction.auto_match": "Matched to a recurring item",
};

function labelFor(action: string, before: unknown, after: unknown): string {
  if (LABELS[action]) return LABELS[action];
  if (action === "transaction.link_recurring") {
    return (after as { matchSource?: string } | null)?.matchSource === "dismissed" ? "Marked as not recurring" : "Linked to a recurring item";
  }
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

const refSchema = z.object({ kind: z.enum(["income", "recurring"]), id: z.string().min(1) }).nullable();

/** Links a row to a paycheck or bill by hand, or says "Not this one" (ref null). */
export async function linkRecurringAction(transactionId: string, ref: ItemRef | null): Promise<{ row: TransactionRow } | Failure> {
  const user = await requireUser();
  try {
    const id = z.string().min(1).parse(transactionId);
    await linkTransaction(getDb(), user.id, id, refSchema.parse(ref));
    revalidatePath("/transactions");
    revalidatePath("/recurring");
    return { row: await getTransactionRow(getDb(), user.id, id) };
  } catch (err) {
    return toFailure(err);
  }
}

/** The latest version of one row (after something else changed it). */
export async function refreshRow(transactionId: string): Promise<{ row: TransactionRow } | Failure> {
  const user = await requireUser();
  try {
    return { row: await getTransactionRow(getDb(), user.id, z.string().min(1).parse(transactionId)) };
  } catch (err) {
    return toFailure(err);
  }
}
