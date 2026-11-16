"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { createPlan, type PlanInput } from "@/server/plan/plans-service";

type Failure = { error: string };

function toFailure(err: unknown): Failure {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Something about that plan wasn't valid" };
  throw err;
}

/** Creates the user's plan from a starting point plus their edits. */
export async function createPlanAction(input: PlanInput): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await createPlan(getDb(), user.id, input);
    revalidatePath("/plan");
    revalidatePath("/recurring");
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}
