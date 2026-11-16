"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { addCommonSubscriptions, type SetupStepKey, skipSetupStep, unskipSetupStep } from "@/server/home/setup-service";

type Failure = { error: string };
const stepKey = z.enum(["start_date", "accounts", "income", "plan", "bills", "goals"]);

function done() {
  revalidatePath("/", "layout");
}

/** Skips a setup step for now. */
export async function skipStepAction(key: SetupStepKey): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  const k = stepKey.safeParse(key);
  if (!k.success) return { error: "Unknown step" };
  await skipSetupStep(getDb(), user.id, k.data);
  done();
  return { ok: true };
}

/** Puts a skipped step back. */
export async function unskipStepAction(key: SetupStepKey): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  const k = stepKey.safeParse(key);
  if (!k.success) return { error: "Unknown step" };
  await unskipSetupStep(getDb(), user.id, k.data);
  done();
  return { ok: true };
}

const picked = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      cents: z.number().int(),
      matchPattern: z.string().trim().min(1).max(120),
      day: z.number().int(),
    }),
  )
  .min(1)
  .max(20);

/** Adds the picked common subscriptions as monthly items. */
export async function addCommonSubscriptionsAction(items: z.input<typeof picked>): Promise<{ added: number } | Failure> {
  const user = await requireUser();
  const parsed = picked.safeParse(items);
  if (!parsed.success) return { error: "Pick at least one subscription" };
  try {
    const added = await addCommonSubscriptions(getDb(), user.id, parsed.data);
    done();
    return { added };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
    throw err;
  }
}
