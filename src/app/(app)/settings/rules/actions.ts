"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { applyRuleToExisting, createRule, deleteRule } from "@/server/categorize/rules-service";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";

type Failure = { error: string };

function toFailure(err: unknown): Failure {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Choose a category and enter some text to match" };
  throw err;
}

const addSchema = z.object({ pattern: z.string().max(200), categoryId: z.string().min(1) });

/** Adds "description contains X → category" and applies it to existing transactions. */
export async function addRule(formData: FormData): Promise<{ applied: number } | Failure> {
  const user = await requireUser();
  try {
    const { pattern, categoryId } = addSchema.parse(Object.fromEntries(formData));
    const rule = await createRule(getDb(), user.id, { matchType: "description_contains", pattern, categoryId, createdFrom: "user" });
    const applied = await applyRuleToExisting(getDb(), user.id, rule.id);
    revalidatePath("/settings/rules");
    revalidatePath("/transactions");
    return { applied };
  } catch (err) {
    return toFailure(err);
  }
}

export async function removeRule(id: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await deleteRule(getDb(), user.id, z.string().parse(id));
    revalidatePath("/settings/rules");
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}
