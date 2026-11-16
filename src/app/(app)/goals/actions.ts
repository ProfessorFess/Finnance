"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import type { GoalStatus } from "@/server/db/finance-schema";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { setContributionCounted } from "@/server/goals/credit-service";
import { addContribution, createGoal, deleteGoal, type GoalInput, goalInputSchema, moveGoal, setGoalStatus, updateGoal } from "@/server/goals/goals-service";

type Result = { ok: true } | { error: string };

function toFailure(err: unknown): { error: string } {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Something about that goal wasn't valid" };
  throw err;
}

function done() {
  revalidatePath("/goals");
  revalidatePath("/plan");
}

async function run(fn: (userId: string) => Promise<unknown>): Promise<Result> {
  const user = await requireUser();
  try {
    await fn(user.id);
    done();
    return { ok: true };
  } catch (err) {
    return toFailure(err);
  }
}

const id = z.string().min(1);

export async function saveGoalAction(input: GoalInput, goalId?: string): Promise<Result> {
  return run((userId) => {
    const g = goalInputSchema.parse(input);
    return goalId ? updateGoal(getDb(), userId, id.parse(goalId), g) : createGoal(getDb(), userId, g);
  });
}

export async function deleteGoalAction(goalId: string): Promise<Result> {
  return run((userId) => deleteGoal(getDb(), userId, id.parse(goalId)));
}

export async function moveGoalAction(goalId: string, direction: "up" | "down"): Promise<Result> {
  return run((userId) => moveGoal(getDb(), userId, id.parse(goalId), z.enum(["up", "down"]).parse(direction)));
}

export async function setGoalStatusAction(goalId: string, status: GoalStatus): Promise<Result> {
  return run((userId) => setGoalStatus(getDb(), userId, id.parse(goalId), z.enum(["active", "paused", "completed", "archived"]).parse(status)));
}

const contributionSchema = z.object({ date: z.string(), amountCents: z.number().int(), note: z.string().max(200).optional() });

/** Money added to a goal by hand (negative = a withdrawal). */
export async function addContributionAction(goalId: string, input: { date: string; amountCents: number; note?: string }): Promise<Result> {
  return run((userId) => addContribution(getDb(), userId, id.parse(goalId), contributionSchema.parse(input)));
}

export async function setContributionCountedAction(contributionId: string, counted: boolean): Promise<Result> {
  return run((userId) => setContributionCounted(getDb(), userId, id.parse(contributionId), z.boolean().parse(counted)));
}
