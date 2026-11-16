"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import {
  bucketDraftSchema,
  createBucket,
  createPlan,
  deleteBucket,
  deletePlan,
  type PlanInput,
  renamePlan,
  setExtraIncomeRule,
  setPlanIncomes,
  updateBucket,
} from "@/server/plan/plans-service";
import type { BucketDraft } from "@/server/plan/templates";

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

function done() {
  revalidatePath("/plan");
  revalidatePath("/recurring");
}

/** Adds a bucket, or saves changes to one. */
export async function saveBucketAction(planId: string, draft: BucketDraft, bucketId?: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    const d = bucketDraftSchema.parse(draft);
    if (bucketId) await updateBucket(getDb(), user.id, z.string().min(1).parse(bucketId), d);
    else await createBucket(getDb(), user.id, z.string().min(1).parse(planId), d);
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteBucketAction(bucketId: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await deleteBucket(getDb(), user.id, z.string().min(1).parse(bucketId));
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

export async function setPlanIncomesAction(planId: string, incomeSourceIds: string[]): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await setPlanIncomes(getDb(), user.id, z.string().min(1).parse(planId), z.array(z.string()).max(50).parse(incomeSourceIds));
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

const extraSchema = z.object({ bucketId: z.string().min(1), incomeSourceId: z.string().min(1), percentBps: z.number().int() }).nullable();

export async function setExtraIncomeAction(planId: string, input: { bucketId: string; incomeSourceId: string; percentBps: number } | null): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await setExtraIncomeRule(getDb(), user.id, z.string().min(1).parse(planId), extraSchema.parse(input));
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

export async function renamePlanAction(planId: string, name: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await renamePlan(getDb(), user.id, z.string().min(1).parse(planId), z.string().max(200).parse(name));
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

/** "Start over": deletes the plan. Transactions and recurring items stay. */
export async function deletePlanAction(planId: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser();
  try {
    await deletePlan(getDb(), user.id, z.string().min(1).parse(planId));
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}
