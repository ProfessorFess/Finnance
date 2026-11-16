import { and, asc, eq } from "drizzle-orm";
import { parseDateValue } from "@/lib/dates";
import { applyRuleToExisting, createRule } from "@/server/categorize/rules-service";
import {
  accounts,
  type AmountMode,
  categories,
  type IncomeType,
  incomeSources,
  type RecurringKind,
  recurringRules,
  transactions,
} from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { assertBucket, defaultBillBucketId } from "@/server/plan/plans-service";
import { rematchItem } from "./matching-service";
import type { Frequency, ScheduledFrequency } from "./schedule";

export type ItemRef = { kind: "income"; id: string } | { kind: "recurring"; id: string };
export type IncomeSource = typeof incomeSources.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;

export type IncomeSourceInput = {
  name: string;
  type: IncomeType;
  frequency: Frequency;
  anchorDate: string | null;
  secondDay: number | null;
  amountMode: AmountMode;
  expectedCents: number | null;
  minCents?: number | null;
  maxCents?: number | null;
  accountId: string | null;
  categoryId: string | null;
  matchPattern: string;
  active?: boolean;
};

export type RecurringRuleInput = {
  name: string;
  kind: RecurringKind;
  frequency: ScheduledFrequency;
  anchorDate: string;
  secondDay: number | null;
  expectedCents: number;
  amountVaries: boolean;
  toleranceCents: number | null;
  accountId: string | null;
  categoryId: string | null;
  matchPattern: string;
  active?: boolean;
  /** The budget bucket it's paid from. Omitted: the plan's bills bucket on create, unchanged on update. */
  bucketId?: string | null;
};

function checkName(name: string): string {
  const n = name.trim();
  if (!n || n.length > 80) throw new ValidationError("Give it a name");
  return n;
}

function checkPattern(pattern: string): string {
  const p = pattern.trim();
  if (!p || p.length > 200) throw new ValidationError("Enter text to match");
  return p;
}

function checkAmount(cents: number | null | undefined): void {
  if (cents !== null && cents !== undefined && (!Number.isInteger(cents) || cents <= 0)) throw new ValidationError("Enter an amount above $0");
}

/** Validates a schedule; irregular clears the dates. */
function checkSchedule(frequency: Frequency, anchorDate: string | null, secondDay: number | null): { anchorDate: string | null; secondDay: number | null } {
  if (frequency === "irregular") return { anchorDate: null, secondDay: null };
  if (!anchorDate || parseDateValue(anchorDate, "YYYY-MM-DD") !== anchorDate) throw new ValidationError("Choose the first date");
  if (frequency !== "semimonthly") return { anchorDate, secondDay: null };
  const anchorDay = Number(anchorDate.slice(8, 10));
  if (secondDay === null || !Number.isInteger(secondDay) || secondDay < 1 || secondDay > 31 || secondDay === anchorDay) {
    throw new ValidationError("Choose the second day of the month");
  }
  return { anchorDate, secondDay };
}

async function checkOwnership(db: Executor, userId: string, accountId: string | null, categoryId: string | null): Promise<void> {
  if (accountId) {
    const [a] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
    if (!a) throw new NotFoundError("Account");
  }
  if (categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    if (!c) throw new NotFoundError("Category");
  }
}

async function cleanIncome(db: Executor, userId: string, input: IncomeSourceInput) {
  const name = checkName(input.name);
  const matchPattern = checkPattern(input.matchPattern);
  const schedule = checkSchedule(input.frequency, input.anchorDate, input.secondDay);
  checkAmount(input.expectedCents);
  checkAmount(input.minCents);
  checkAmount(input.maxCents);
  await checkOwnership(db, userId, input.accountId, input.categoryId);
  return {
    name,
    type: input.type,
    frequency: input.frequency,
    ...schedule,
    amountMode: input.amountMode,
    expectedCents: input.expectedCents,
    minCents: input.minCents ?? null,
    maxCents: input.maxCents ?? null,
    accountId: input.accountId,
    categoryId: input.categoryId,
    matchPattern,
    active: input.active ?? true,
  };
}

async function cleanRule(db: Executor, userId: string, input: RecurringRuleInput) {
  if ((input.frequency as Frequency) === "irregular") throw new ValidationError("Irregular only works for income");
  const name = checkName(input.name);
  const matchPattern = checkPattern(input.matchPattern);
  const schedule = checkSchedule(input.frequency, input.anchorDate, input.secondDay);
  if (input.expectedCents === null || input.expectedCents === undefined) throw new ValidationError("Enter an amount above $0");
  checkAmount(input.expectedCents);
  if (input.toleranceCents !== null && (!Number.isInteger(input.toleranceCents) || input.toleranceCents < 0)) {
    throw new ValidationError("Enter a tolerance of $0 or more");
  }
  await checkOwnership(db, userId, input.accountId, input.categoryId);
  return {
    name,
    kind: input.kind,
    frequency: input.frequency,
    anchorDate: schedule.anchorDate!,
    secondDay: schedule.secondDay,
    expectedCents: input.expectedCents,
    amountVaries: input.amountVaries,
    toleranceCents: input.toleranceCents,
    accountId: input.accountId,
    categoryId: input.categoryId,
    matchPattern,
    active: input.active ?? true,
  };
}

/** An item with a category teaches Finnance to sort matching rows into it (spec 7.5). */
async function ruleFromItem(db: Database, userId: string, pattern: string, categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const rule = await createRule(db, userId, { matchType: "description_contains", pattern, categoryId, createdFrom: "recurring" });
  await applyRuleToExisting(db, userId, rule.id);
}

async function saved(db: Database, userId: string, ref: ItemRef, pattern: string, categoryId: string | null): Promise<void> {
  await ruleFromItem(db, userId, pattern, categoryId);
  await rematchItem(db, userId, ref);
}

/** Unlinks every row from an item (before it is deleted). */
async function clearLinks(db: Executor, userId: string, ref: ItemRef): Promise<void> {
  const column = ref.kind === "income" ? transactions.incomeSourceId : transactions.recurringRuleId;
  await db
    .update(transactions)
    .set({ incomeSourceId: null, recurringRuleId: null, expectedDate: null, matchSource: null })
    .where(and(eq(transactions.userId, userId), eq(column, ref.id)));
}

export async function listIncomeSources(db: Database, userId: string): Promise<IncomeSource[]> {
  return db.select().from(incomeSources).where(eq(incomeSources.userId, userId)).orderBy(asc(incomeSources.name), asc(incomeSources.id));
}

export async function listRecurringRules(db: Database, userId: string): Promise<RecurringRule[]> {
  return db.select().from(recurringRules).where(eq(recurringRules.userId, userId)).orderBy(asc(recurringRules.name), asc(recurringRules.id));
}

async function getIncome(db: Executor, userId: string, id: string): Promise<IncomeSource> {
  const [row] = await db.select().from(incomeSources).where(and(eq(incomeSources.id, id), eq(incomeSources.userId, userId)));
  if (!row) throw new NotFoundError("Income source");
  return row;
}

async function getRule(db: Executor, userId: string, id: string): Promise<RecurringRule> {
  const [row] = await db.select().from(recurringRules).where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  if (!row) throw new NotFoundError("Recurring item");
  return row;
}

export async function createIncomeSource(db: Database, userId: string, input: IncomeSourceInput): Promise<IncomeSource> {
  const values = await cleanIncome(db, userId, input);
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(incomeSources).values({ userId, ...values }).returning();
    await logActivity(tx, { userId, actor: "user", action: "income_source.create", entityType: "income_source", entityId: created!.id, after: created });
    return created!;
  });
  await saved(db, userId, { kind: "income", id: row.id }, row.matchPattern, row.categoryId);
  return getIncome(db, userId, row.id);
}

export async function updateIncomeSource(db: Database, userId: string, id: string, input: IncomeSourceInput): Promise<IncomeSource> {
  const before = await getIncome(db, userId, id);
  const values = await cleanIncome(db, userId, input);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(incomeSources)
      .set(values)
      .where(and(eq(incomeSources.id, id), eq(incomeSources.userId, userId)))
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "income_source.update", entityType: "income_source", entityId: id, before, after: updated });
    return updated!;
  });
  await saved(db, userId, { kind: "income", id }, row.matchPattern, row.categoryId);
  return getIncome(db, userId, id);
}

export async function deleteIncomeSource(db: Database, userId: string, id: string): Promise<void> {
  const before = await getIncome(db, userId, id);
  await db.transaction(async (tx) => {
    await clearLinks(tx, userId, { kind: "income", id });
    await tx.delete(incomeSources).where(and(eq(incomeSources.id, id), eq(incomeSources.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "income_source.delete", entityType: "income_source", entityId: id, before });
  });
}

/** Which bucket pays a bill: as given (checked), or the plan's default for new bills and subscriptions. */
async function bucketFor(db: Database, userId: string, input: RecurringRuleInput, current: string | null | undefined): Promise<string | null> {
  if (input.bucketId === undefined) {
    if (current !== undefined) return current;
    return input.kind === "transfer" ? null : defaultBillBucketId(db, userId);
  }
  if (input.bucketId) await assertBucket(db, userId, input.bucketId);
  return input.bucketId;
}

export async function createRecurringRule(db: Database, userId: string, input: RecurringRuleInput): Promise<RecurringRule> {
  const values = { ...(await cleanRule(db, userId, input)), bucketId: await bucketFor(db, userId, input, undefined) };
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(recurringRules).values({ userId, ...values }).returning();
    await logActivity(tx, { userId, actor: "user", action: "recurring_rule.create", entityType: "recurring_rule", entityId: created!.id, after: created });
    return created!;
  });
  await saved(db, userId, { kind: "recurring", id: row.id }, row.matchPattern, row.categoryId);
  return getRule(db, userId, row.id);
}

export async function updateRecurringRule(db: Database, userId: string, id: string, input: RecurringRuleInput): Promise<RecurringRule> {
  const before = await getRule(db, userId, id);
  const values = { ...(await cleanRule(db, userId, input)), bucketId: await bucketFor(db, userId, input, before.bucketId) };
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(recurringRules)
      .set(values)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)))
      .returning();
    await logActivity(tx, { userId, actor: "user", action: "recurring_rule.update", entityType: "recurring_rule", entityId: id, before, after: updated });
    return updated!;
  });
  await saved(db, userId, { kind: "recurring", id }, row.matchPattern, row.categoryId);
  return getRule(db, userId, id);
}

export async function deleteRecurringRule(db: Database, userId: string, id: string): Promise<void> {
  const before = await getRule(db, userId, id);
  await db.transaction(async (tx) => {
    await clearLinks(tx, userId, { kind: "recurring", id });
    await tx.delete(recurringRules).where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "recurring_rule.delete", entityType: "recurring_rule", entityId: id, before });
  });
}

/** Loads one item by reference (for matching and manual links). */
export async function getItem(db: Executor, userId: string, ref: ItemRef): Promise<IncomeSource | RecurringRule> {
  return ref.kind === "income" ? getIncome(db, userId, ref.id) : getRule(db, userId, ref.id);
}

