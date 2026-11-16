import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";
import { z } from "zod";
import {
  accounts,
  budgetPlans,
  buckets,
  categories,
  incomeSources,
  planIncomeSources,
  planRules,
  recurringRules,
} from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import type { BucketDraft } from "./templates";

export type Plan = typeof budgetPlans.$inferSelect;
export type Bucket = typeof buckets.$inferSelect;
export type PlanRule = typeof planRules.$inferSelect;

const cents = z.number().int().nullable();
export const bucketDraftSchema = z.object({
  name: z.string().max(200),
  role: z.enum(["spending", "bills", "savings", "goal", "buffer"]),
  icon: z.string().min(1).max(40),
  fundingType: z.enum(["fixed", "percent", "sum_of_recurring", "remainder"]),
  fundingCents: cents,
  fundingBps: z.number().int().nullable(),
  limitCents: cents,
  limitPeriod: z.enum(["weekly", "monthly", "per_income"]).nullable(),
  trackCategoryIds: z.array(z.string()).max(200),
  destinationAccountId: z.string().nullable(),
});
export const planInputSchema = z.object({
  template: z.enum(["paycheck_plan", "monthly_categories", "fifty_thirty_twenty", "custom"]),
  cadence: z.enum(["per_income", "monthly"]),
  name: z.string().max(80),
  incomeSourceIds: z.array(z.string()).max(50),
  buckets: z.array(bucketDraftSchema).max(50),
  extraIncome: z.object({ bucketIndex: z.number().int().min(0), incomeSourceId: z.string() }).nullable(),
});
export type PlanInput = z.infer<typeof planInputSchema>;

/** Validates one bucket draft and returns the row values (without plan or order). */
async function cleanDraft(db: Executor, userId: string, draft: BucketDraft) {
  const d = bucketDraftSchema.parse(draft);
  const name = d.name.trim();
  if (!name || name.length > 80) throw new ValidationError("Give it a name");
  if (d.fundingType === "fixed" && !(d.fundingCents !== null && d.fundingCents > 0)) throw new ValidationError("Enter an amount above $0");
  if (d.fundingType === "percent" && !(d.fundingBps !== null && d.fundingBps >= 100 && d.fundingBps <= 10_000)) {
    throw new ValidationError("Enter a percent between 1 and 100");
  }
  if (d.limitPeriod && !(d.limitCents !== null && d.limitCents > 0)) throw new ValidationError("Enter a limit above $0");
  if (d.destinationAccountId) {
    const [a] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, d.destinationAccountId), eq(accounts.userId, userId)));
    if (!a) throw new NotFoundError("Account");
  }
  const trackCategoryIds = [...new Set(d.trackCategoryIds)];
  if (trackCategoryIds.length) {
    const found = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, userId), inArray(categories.id, trackCategoryIds)));
    if (found.length !== trackCategoryIds.length) throw new NotFoundError("Category");
  }
  return {
    name,
    role: d.role,
    icon: d.icon,
    fundingType: d.fundingType,
    fundingCents: d.fundingType === "fixed" ? d.fundingCents : null,
    fundingBps: d.fundingType === "percent" ? d.fundingBps : null,
    limitCents: d.limitPeriod ? d.limitCents : null,
    limitPeriod: d.limitPeriod,
    trackCategoryIds,
    destinationAccountId: d.destinationAccountId,
  };
}

async function checkIncomes(db: Executor, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new ValidationError("Choose at least one income");
  const found = await db.select().from(incomeSources).where(and(eq(incomeSources.userId, userId), inArray(incomeSources.id, unique)));
  if (found.length !== unique.length) throw new NotFoundError("Income source");
  return found;
}

function checkExtraRule(cadence: Plan["cadence"], source: { frequency: string } | undefined) {
  if (cadence !== "per_income") throw new ValidationError("Extra-income rules apply to plans that split each income");
  if (!source) throw new NotFoundError("Income source");
  if (source.frequency === "irregular") throw new ValidationError("Choose an income with a schedule for this rule");
}

async function getPlan(db: Executor, userId: string, planId: string): Promise<Plan> {
  const [plan] = await db.select().from(budgetPlans).where(and(eq(budgetPlans.id, planId), eq(budgetPlans.userId, userId)));
  if (!plan) throw new NotFoundError("Plan");
  return plan;
}

async function getBucket(db: Executor, userId: string, bucketId: string): Promise<Bucket> {
  const [bucket] = await db.select().from(buckets).where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId)));
  if (!bucket) throw new NotFoundError("Bucket");
  return bucket;
}

/** The plan's bucket that pays bills by default: the first funded by its bills, else the first Bills bucket. */
function billBucketIn(list: Bucket[]): string | null {
  return list.find((b) => b.fundingType === "sum_of_recurring")?.id ?? list.find((b) => b.role === "bills")?.id ?? null;
}

/** Creates a plan from a template plus the user's edits. One active plan per user. */
export async function createPlan(db: Database, userId: string, input: PlanInput): Promise<Plan> {
  const p = planInputSchema.parse(input);
  const name = p.name.trim() || "My plan";
  const [existing] = await db.select({ id: budgetPlans.id }).from(budgetPlans).where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.active, true)));
  if (existing) throw new ValidationError("You already have a plan");
  const sources = await checkIncomes(db, userId, p.incomeSourceIds);
  if (p.buckets.length === 0) throw new ValidationError("A plan needs at least one bucket");
  const rows: Awaited<ReturnType<typeof cleanDraft>>[] = [];
  for (const d of p.buckets) rows.push(await cleanDraft(db, userId, d));
  if (rows.filter((r) => r.fundingType === "remainder").length > 1) throw new ValidationError("Only one bucket can take what's left");
  if (p.extraIncome) {
    checkExtraRule(p.cadence, sources.find((s) => s.id === p.extraIncome!.incomeSourceId));
    if (p.extraIncome.bucketIndex >= rows.length) throw new ValidationError("Choose a bucket for extra paychecks");
  }

  return db.transaction(async (tx) => {
    const [plan] = await tx.insert(budgetPlans).values({ userId, name, template: p.template, cadence: p.cadence }).returning();
    await tx.insert(planIncomeSources).values(sources.map((s) => ({ planId: plan!.id, incomeSourceId: s.id, userId })));
    const created = await tx
      .insert(buckets)
      .values(rows.map((r, i) => ({ ...r, userId, planId: plan!.id, sortOrder: i })))
      .returning();
    const ordered = [...created].sort((a, b) => a.sortOrder - b.sortOrder);
    if (p.extraIncome) {
      await tx.insert(planRules).values({
        userId,
        planId: plan!.id,
        type: "extra_income",
        bucketId: ordered[p.extraIncome.bucketIndex]!.id,
        incomeSourceId: p.extraIncome.incomeSourceId,
      });
    }
    const billBucket = billBucketIn(ordered);
    if (billBucket) {
      await tx
        .update(recurringRules)
        .set({ bucketId: billBucket })
        .where(
          and(
            eq(recurringRules.userId, userId),
            eq(recurringRules.active, true),
            isNull(recurringRules.bucketId),
            inArray(recurringRules.kind, ["bill", "subscription"]),
          ),
        );
    }
    await logActivity(tx, { userId, actor: "user", action: "plan.create", entityType: "budget_plan", entityId: plan!.id, after: { plan, buckets: ordered } });
    return plan!;
  });
}

export async function getActivePlan(
  db: Database,
  userId: string,
): Promise<{ plan: Plan; buckets: Bucket[]; rules: PlanRule[]; incomeSourceIds: string[] } | null> {
  const [plan] = await db.select().from(budgetPlans).where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.active, true)));
  if (!plan) return null;
  const [list, rules, links] = await Promise.all([
    db.select().from(buckets).where(and(eq(buckets.planId, plan.id), eq(buckets.userId, userId))).orderBy(asc(buckets.sortOrder), asc(buckets.createdAt)),
    db.select().from(planRules).where(and(eq(planRules.planId, plan.id), eq(planRules.userId, userId))),
    db.select({ id: planIncomeSources.incomeSourceId }).from(planIncomeSources).where(and(eq(planIncomeSources.planId, plan.id), eq(planIncomeSources.userId, userId))),
  ]);
  return { plan, buckets: list, rules, incomeSourceIds: links.map((l) => l.id) };
}

export async function setPlanIncomes(db: Database, userId: string, planId: string, incomeSourceIds: string[]): Promise<void> {
  const plan = await getPlan(db, userId, planId);
  const sources = await checkIncomes(db, userId, incomeSourceIds);
  await db.transaction(async (tx) => {
    await tx.delete(planIncomeSources).where(and(eq(planIncomeSources.planId, plan.id), eq(planIncomeSources.userId, userId)));
    await tx.insert(planIncomeSources).values(sources.map((s) => ({ planId: plan.id, incomeSourceId: s.id, userId })));
    // An extra-income rule for a source that no longer funds the plan goes with it.
    const rules = await tx.select().from(planRules).where(eq(planRules.planId, plan.id));
    for (const r of rules) {
      if (r.incomeSourceId && !sources.some((s) => s.id === r.incomeSourceId)) await tx.delete(planRules).where(eq(planRules.id, r.id));
    }
    await logActivity(tx, { userId, actor: "user", action: "plan.update", entityType: "budget_plan", entityId: plan.id, after: { incomeSourceIds: sources.map((s) => s.id) } });
  });
}

export async function renamePlan(db: Database, userId: string, planId: string, name: string): Promise<void> {
  const plan = await getPlan(db, userId, planId);
  const clean = name.trim();
  if (!clean || clean.length > 80) throw new ValidationError("Give it a name");
  await db.transaction(async (tx) => {
    await tx.update(budgetPlans).set({ name: clean }).where(eq(budgetPlans.id, plan.id));
    await logActivity(tx, { userId, actor: "user", action: "plan.update", entityType: "budget_plan", entityId: plan.id, before: { name: plan.name }, after: { name: clean } });
  });
}

async function assertOneRemainder(db: Executor, planId: string, exceptBucketId: string | null, fundingType: string) {
  if (fundingType !== "remainder") return;
  const others = await db.select({ id: buckets.id }).from(buckets).where(and(eq(buckets.planId, planId), eq(buckets.fundingType, "remainder")));
  if (others.some((o) => o.id !== exceptBucketId)) throw new ValidationError("Only one bucket can take what's left");
}

export async function createBucket(db: Database, userId: string, planId: string, draft: BucketDraft): Promise<Bucket> {
  const plan = await getPlan(db, userId, planId);
  const values = await cleanDraft(db, userId, draft);
  await assertOneRemainder(db, plan.id, null, values.fundingType);
  return db.transaction(async (tx) => {
    const [{ top }] = (await tx.select({ top: max(buckets.sortOrder) }).from(buckets).where(eq(buckets.planId, plan.id))) as [{ top: number | null }];
    const [created] = await tx
      .insert(buckets)
      .values({ ...values, userId, planId: plan.id, sortOrder: (top ?? -1) + 1 })
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "bucket.create", entityType: "bucket", entityId: created!.id, after: created });
    return created!;
  });
}

export async function updateBucket(db: Database, userId: string, bucketId: string, draft: BucketDraft): Promise<Bucket> {
  const before = await getBucket(db, userId, bucketId);
  const values = await cleanDraft(db, userId, draft);
  await assertOneRemainder(db, before.planId, before.id, values.fundingType);
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(buckets).set(values).where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId))).returning();
    await logActivity(tx, { userId, actor: "user", action: "bucket.update", entityType: "bucket", entityId: bucketId, before, after: updated });
    return updated!;
  });
}

export async function deleteBucket(db: Database, userId: string, bucketId: string): Promise<void> {
  const before = await getBucket(db, userId, bucketId);
  const siblings = await db.select({ id: buckets.id }).from(buckets).where(eq(buckets.planId, before.planId));
  if (siblings.length <= 1) throw new ValidationError("A plan needs at least one bucket");
  await db.transaction(async (tx) => {
    await tx.delete(buckets).where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "bucket.delete", entityType: "bucket", entityId: bucketId, before });
  });
}

/** A stored bucket as an editable draft. */
export function bucketDraftOf(b: Bucket): BucketDraft {
  return {
    name: b.name,
    role: b.role,
    icon: b.icon,
    fundingType: b.fundingType,
    fundingCents: b.fundingCents,
    fundingBps: b.fundingBps,
    limitCents: b.limitCents,
    limitPeriod: b.limitPeriod,
    trackCategoryIds: b.trackCategoryIds,
    destinationAccountId: b.destinationAccountId,
  };
}

export async function setExtraIncomeRule(
  db: Database,
  userId: string,
  planId: string,
  input: { bucketId: string; incomeSourceId: string; percentBps: number } | null,
): Promise<void> {
  const plan = await getPlan(db, userId, planId);
  if (input) {
    const bucket = await getBucket(db, userId, input.bucketId);
    if (bucket.planId !== plan.id) throw new NotFoundError("Bucket");
    const [source] = await db
      .select()
      .from(incomeSources)
      .innerJoin(planIncomeSources, eq(planIncomeSources.incomeSourceId, incomeSources.id))
      .where(and(eq(incomeSources.id, input.incomeSourceId), eq(incomeSources.userId, userId), eq(planIncomeSources.planId, plan.id)));
    checkExtraRule(plan.cadence, source?.income_sources);
    if (!(input.percentBps >= 100 && input.percentBps <= 10_000)) throw new ValidationError("Enter a percent between 1 and 100");
  }
  await db.transaction(async (tx) => {
    await tx.delete(planRules).where(and(eq(planRules.planId, plan.id), eq(planRules.type, "extra_income")));
    if (input) {
      await tx.insert(planRules).values({ userId, planId: plan.id, type: "extra_income", bucketId: input.bucketId, incomeSourceId: input.incomeSourceId, percentBps: input.percentBps });
    }
    await logActivity(tx, { userId, actor: "user", action: "plan_rule.set", entityType: "budget_plan", entityId: plan.id, after: input });
  });
}

export async function deletePlan(db: Database, userId: string, planId: string): Promise<void> {
  const plan = await getPlan(db, userId, planId);
  await db.transaction(async (tx) => {
    await tx.delete(budgetPlans).where(and(eq(budgetPlans.id, plan.id), eq(budgetPlans.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "plan.delete", entityType: "budget_plan", entityId: plan.id, before: plan });
  });
}

async function activeBuckets(db: Executor, userId: string): Promise<Bucket[]> {
  return db
    .select({ bucket: buckets })
    .from(buckets)
    .innerJoin(budgetPlans, eq(budgetPlans.id, buckets.planId))
    .where(and(eq(buckets.userId, userId), eq(budgetPlans.active, true)))
    .orderBy(asc(buckets.sortOrder), asc(buckets.createdAt))
    .then((rows) => rows.map((r) => r.bucket));
}

/** Buckets a bill can be paid from. */
export async function billBucketOptions(db: Executor, userId: string): Promise<{ id: string; name: string }[]> {
  return (await activeBuckets(db, userId)).map((b) => ({ id: b.id, name: b.name }));
}

/** Where a new bill is paid from by default. */
export async function defaultBillBucketId(db: Executor, userId: string): Promise<string | null> {
  return billBucketIn(await activeBuckets(db, userId));
}

/** Throws unless the bucket belongs to the user. */
export async function assertBucket(db: Executor, userId: string, bucketId: string): Promise<void> {
  await getBucket(db, userId, bucketId);
}
