"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { ACCOUNT_TYPES, archiveAccount, createAccount, updateAccount } from "@/server/finance/accounts";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { setTrackingStartDate } from "@/server/finance/settings";
import { requireUser } from "@/server/auth/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { ok: false, error: err.message };
  throw err;
}

export async function saveStartDate(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await setTrackingStartDate(getDb(), user.id, String(formData.get("startDate") ?? ""));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/accounts");
  return { ok: true };
}

const accountForm = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES as [string, ...string[]]),
  institution: z.string().optional(),
  lastFour: z.string().optional(),
  balance: z.string(),
});

export async function saveAccount(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = accountForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the account details and try again" };
  const { id, name, type, institution, lastFour, balance } = parsed.data;
  const startingBalanceCents = parseAmountToCents(balance);
  if (startingBalanceCents === null) return { ok: false, error: "Enter the balance as a dollar amount, like 1,520.34" };

  const input = {
    name,
    type: type as (typeof ACCOUNT_TYPES)[number],
    institution: institution ?? null,
    lastFour: lastFour ?? null,
    startingBalanceCents,
  };
  try {
    if (id) await updateAccount(getDb(), user.id, id, input);
    else await createAccount(getDb(), user.id, input);
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/accounts");
  return { ok: true };
}

export async function archiveAccountAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await archiveAccount(getDb(), user.id, z.string().parse(id));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/accounts");
  return { ok: true };
}
