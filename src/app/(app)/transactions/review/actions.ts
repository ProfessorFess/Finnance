"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAiCategorizer } from "@/server/ai";
import { requireUser } from "@/server/auth/session";
import { chooseCategory, type Learned } from "@/server/categorize/learn";
import { type CategorizeSummary, sortTransactions } from "@/server/categorize/pipeline";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import type { TransactionRow } from "@/server/finance/transactions";

type Failure = { error: string };

function toFailure(err: unknown): Failure {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Something about that input wasn't valid" };
  throw err;
}

/** The user's answer for one card in the review queue. */
export async function confirmCategory(id: string, categoryId: string): Promise<{ row: TransactionRow; learned: Learned | null } | Failure> {
  const user = await requireUser();
  try {
    const res = await chooseCategory(getDb(), user.id, z.string().parse(id), z.string().parse(categoryId));
    revalidatePath("/transactions");
    return res;
  } catch (err) {
    return toFailure(err);
  }
}

/** Sorts everything not yet sorted (backfill): merchants, transfers, categories. */
export async function sortNow(): Promise<(CategorizeSummary & { transfers: number }) | Failure> {
  const user = await requireUser();
  try {
    const res = await sortTransactions(getDb(), user.id, { ai: getAiCategorizer() });
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return res;
  } catch (err) {
    return toFailure(err);
  }
}
