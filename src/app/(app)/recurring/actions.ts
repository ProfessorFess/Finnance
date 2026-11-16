"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import {
  createIncomeSource,
  createRecurringRule,
  deleteIncomeSource,
  deleteRecurringRule,
  type ItemRef,
  updateIncomeSource,
  updateRecurringRule,
} from "@/server/recurring/items-service";
import { dismissSuggestion } from "@/server/recurring/suggestions-service";
import { logIncome } from "@/server/recurring/log-income";

type Failure = { error: string };

function toFailure(err: unknown): Failure {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Check the highlighted fields and try again" };
  throw err;
}

function revalidate() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
}

const FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "yearly", "irregular"] as const;
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const itemForm = z.object({
  id: optional,
  kind: z.enum(["income", "bill", "subscription", "transfer"]),
  name: z.string().max(200),
  frequency: z.enum(FREQUENCIES),
  anchorDate: optional,
  secondDay: optional,
  amount: optional,
  amountMode: z.enum(["fixed", "varies", "estimated"]).optional(),
  incomeType: z.enum(["salary", "hourly", "freelance", "benefits", "side_income", "other"]).optional(),
  amountVaries: z.string().optional(),
  accountId: optional,
  categoryId: optional,
  matchPattern: z.string().max(400),
  paused: z.string().optional(),
});

/** Adds or edits a paycheck, bill, subscription, or recurring transfer. */
export async function saveItem(formData: FormData): Promise<{ ref: ItemRef } | Failure> {
  const user = await requireUser();
  try {
    const f = itemForm.parse(Object.fromEntries(formData));
    let cents: number | null = null;
    if (f.amount) {
      const parsed = parseAmountToCents(f.amount);
      if (parsed === null || parsed === 0) throw new ValidationError("Enter an amount above $0");
      cents = Math.abs(parsed);
    }
    const secondDay = f.secondDay ? Number(f.secondDay) : null;
    const db = getDb();
    let ref: ItemRef;
    if (f.kind === "income") {
      const input = {
        name: f.name,
        type: f.incomeType ?? "salary",
        frequency: f.frequency,
        anchorDate: f.anchorDate,
        secondDay,
        amountMode: f.amountMode ?? "varies",
        expectedCents: cents,
        accountId: f.accountId,
        categoryId: f.categoryId,
        matchPattern: f.matchPattern,
        active: f.paused !== "on",
      };
      const row = f.id ? await updateIncomeSource(db, user.id, f.id, input) : await createIncomeSource(db, user.id, input);
      ref = { kind: "income", id: row.id };
    } else {
      if (f.frequency === "irregular") throw new ValidationError("Irregular only works for income");
      if (cents === null) throw new ValidationError("Enter an amount above $0");
      const input = {
        name: f.name,
        kind: f.kind,
        frequency: f.frequency,
        anchorDate: f.anchorDate ?? "",
        secondDay,
        expectedCents: cents,
        amountVaries: f.amountVaries === "on",
        toleranceCents: null,
        accountId: f.accountId,
        categoryId: f.categoryId,
        matchPattern: f.matchPattern,
        active: f.paused !== "on",
      };
      const row = f.id ? await updateRecurringRule(db, user.id, f.id, input) : await createRecurringRule(db, user.id, input);
      ref = { kind: "recurring", id: row.id };
    }
    revalidate();
    return { ref };
  } catch (err) {
    return toFailure(err);
  }
}

const refSchema = z.object({ kind: z.enum(["income", "recurring"]), id: z.string().min(1) });

export async function deleteItem(ref: ItemRef): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    const r = refSchema.parse(ref);
    if (r.kind === "income") await deleteIncomeSource(getDb(), user.id, r.id);
    else await deleteRecurringRule(getDb(), user.id, r.id);
    revalidate();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

export async function dismissSuggestionAction(merchantKey: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await dismissSuggestion(getDb(), user.id, z.string().min(1).max(200).parse(merchantKey));
    revalidatePath("/recurring");
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

const logForm = z.object({
  incomeSourceId: z.string().min(1),
  amount: z.string(),
  date: z.string(),
  accountId: z.string().min(1),
  note: z.string().max(200).optional(),
});

/** "I got paid": records income that isn't in a bank file. */
export async function logIncomeAction(formData: FormData): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    const f = logForm.parse(Object.fromEntries(formData));
    const cents = parseAmountToCents(f.amount);
    if (cents === null || cents <= 0) throw new ValidationError("Enter an amount above $0");
    await logIncome(getDb(), user.id, { incomeSourceId: f.incomeSourceId, accountId: f.accountId, date: f.date, amountCents: cents, note: f.note?.trim() || undefined });
    revalidate();
    revalidatePath("/plan");
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}
