import { and, asc, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { addDays, daysBetween } from "@/lib/dates";
import { activityLog, incomeSources, NOT_A_TRANSFER, recurringRules, transactions } from "@/server/db/schema";
import type { Database } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { NotFoundError, ValidationError } from "@/server/finance/errors";
import { getTrackingStartDate } from "@/server/finance/settings";
import type { IncomeSource, ItemRef, RecurringRule } from "./items-service";
import { findMatches, type MatchCandidate, type MatchItem } from "./match";
import { defaultToleranceCents, LINK_REACH_DAYS, MATCH_WINDOW_DAYS, occurrencesBetween, type Schedule } from "./schedule";

const scheduleOf = (i: IncomeSource | RecurringRule): Schedule => ({ frequency: i.frequency, anchorDate: i.anchorDate, secondDay: i.secondDay });

export function incomeToMatchItem(s: IncomeSource): MatchItem {
  return {
    ref: { kind: "income", id: s.id },
    direction: "in",
    schedule: scheduleOf(s),
    pattern: s.matchPattern,
    accountId: s.accountId,
    amount:
      s.amountMode === "fixed" && s.expectedCents !== null
        ? { mode: "near", cents: s.expectedCents, toleranceCents: defaultToleranceCents(s.expectedCents) }
        : { mode: "any" },
    allowTransfers: false,
  };
}

export function ruleToMatchItem(r: RecurringRule): MatchItem {
  return {
    ref: { kind: "recurring", id: r.id },
    direction: "out",
    schedule: scheduleOf(r),
    pattern: r.matchPattern,
    accountId: r.accountId,
    amount: r.amountVaries
      ? { mode: "any" }
      : { mode: "near", cents: r.expectedCents, toleranceCents: r.toleranceCents ?? defaultToleranceCents(r.expectedCents) },
    allowTransfers: r.kind === "transfer",
  };
}

async function activeItems(db: Database, userId: string): Promise<{ income: IncomeSource[]; rules: RecurringRule[] }> {
  const [income, rules] = await Promise.all([
    db.select().from(incomeSources).where(and(eq(incomeSources.userId, userId), eq(incomeSources.active, true))),
    db.select().from(recurringRules).where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true))),
  ]);
  return { income, rules };
}

/** Rows nothing has linked or dismissed yet. */
const unlinked = and(isNull(transactions.matchSource), isNull(transactions.incomeSourceId), isNull(transactions.recurringRuleId));

/**
 * Links imported transactions to the paychecks, bills, and subscriptions they
 * fulfil. Never touches rows the user linked or dismissed, hidden rows, or rows
 * before the tracking start date. Returns how many rows it linked.
 */
export async function matchRecurring(db: Database, userId: string, range?: { from: string; to: string }): Promise<number> {
  const startDate = await getTrackingStartDate(db, userId);
  if (!startDate) return 0;
  const { income, rules } = await activeItems(db, userId);
  if (income.length + rules.length === 0) return 0;

  const conds = [eq(transactions.userId, userId), ne(transactions.status, "excluded"), gte(transactions.date, startDate), unlinked];
  if (range) conds.push(gte(transactions.date, addDays(range.from, -MATCH_WINDOW_DAYS)), lte(transactions.date, addDays(range.to, MATCH_WINDOW_DAYS)));
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      accountId: transactions.accountId,
      description: transactions.rawDescription,
      merchant: transactions.merchant,
      pairId: transactions.transferPairId,
    })
    .from(transactions)
    .where(and(...conds));
  if (rows.length === 0) return 0;
  const candidates: MatchCandidate[] = rows.map(({ pairId, ...r }) => ({ ...r, isTransfer: pairId !== null && pairId !== NOT_A_TRANSFER }));

  const takenRows = await db
    .select({ incomeSourceId: transactions.incomeSourceId, recurringRuleId: transactions.recurringRuleId, expectedDate: transactions.expectedDate })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNotNull(transactions.expectedDate)));
  const taken = takenRows.flatMap((t): { ref: ItemRef; expectedDate: string }[] => {
    if (t.incomeSourceId) return [{ ref: { kind: "income", id: t.incomeSourceId }, expectedDate: t.expectedDate! }];
    if (t.recurringRuleId) return [{ ref: { kind: "recurring", id: t.recurringRuleId }, expectedDate: t.expectedDate! }];
    return [];
  });

  const dates = candidates.map((c) => c.date).sort();
  const window = range ?? { from: dates[0]!, to: dates[dates.length - 1]! };
  const links = findMatches([...income.map(incomeToMatchItem), ...rules.map(ruleToMatchItem)], candidates, taken, window);
  if (links.length === 0) return 0;

  const linked = await db.transaction(async (tx) => {
    const done: typeof links = [];
    for (const l of links) {
      // Re-check at write time: the user may have linked or dismissed this row meanwhile.
      const updated = await tx
        .update(transactions)
        .set({
          incomeSourceId: l.ref.kind === "income" ? l.ref.id : null,
          recurringRuleId: l.ref.kind === "recurring" ? l.ref.id : null,
          expectedDate: l.expectedDate,
          matchSource: "auto",
        })
        .where(and(eq(transactions.id, l.transactionId), eq(transactions.userId, userId), unlinked))
        .returning({ id: transactions.id });
      if (updated.length) done.push(l);
    }
    if (done.length) {
      await tx.insert(activityLog).values(
        done.map((l) => ({
          userId,
          actor: "system" as const,
          action: "transaction.auto_match",
          entityType: "transaction",
          entityId: l.transactionId,
          after: { [l.ref.kind === "income" ? "incomeSourceId" : "recurringRuleId"]: l.ref.id, expectedDate: l.expectedDate },
        })),
      );
    }
    return done.length;
  });

  await fillExpectedAmounts(db, userId, income);
  return linked;
}

/** "Not sure of the amount": take it from the first matched deposit (spec 13, step 3). */
async function fillExpectedAmounts(db: Database, userId: string, income: IncomeSource[]): Promise<void> {
  // Irregular income's amount is per month, so one deposit can't stand in for it.
  for (const s of income.filter((i) => i.expectedCents === null && i.frequency !== "irregular")) {
    const [first] = await db
      .select({ amountCents: transactions.amountCents })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.incomeSourceId, s.id)))
      .orderBy(asc(transactions.date), asc(transactions.id))
      .limit(1);
    if (!first) continue;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(incomeSources)
        .set({ expectedCents: Math.abs(first.amountCents) })
        .where(and(eq(incomeSources.id, s.id), eq(incomeSources.userId, userId), isNull(incomeSources.expectedCents)))
        .returning();
      if (updated) {
        await logActivity(tx, { userId, actor: "system", action: "income_source.update", entityType: "income_source", entityId: s.id, before: s, after: updated });
      }
    });
  }
}

/** Re-matches one item from scratch (after it changed): drops its automatic links, keeps the user's. */
export async function rematchItem(db: Database, userId: string, ref: ItemRef): Promise<number> {
  const column = ref.kind === "income" ? transactions.incomeSourceId : transactions.recurringRuleId;
  await db
    .update(transactions)
    .set({ incomeSourceId: null, recurringRuleId: null, expectedDate: null, matchSource: null })
    .where(and(eq(transactions.userId, userId), eq(column, ref.id), eq(transactions.matchSource, "auto")));
  return matchRecurring(db, userId);
}

async function loadItem(db: Database, userId: string, ref: ItemRef): Promise<IncomeSource | RecurringRule> {
  const [row] =
    ref.kind === "income"
      ? await db.select().from(incomeSources).where(and(eq(incomeSources.id, ref.id), eq(incomeSources.userId, userId)))
      : await db.select().from(recurringRules).where(and(eq(recurringRules.id, ref.id), eq(recurringRules.userId, userId)));
  if (!row) throw new NotFoundError("Recurring item");
  return row;
}

/**
 * The user links a transaction to an item by hand, or says "Not this one"
 * (`ref` null). Either way it's final: automation never changes it again.
 */
export async function linkTransaction(db: Database, userId: string, transactionId: string, ref: ItemRef | null): Promise<void> {
  const [row] = await db
    .select({ id: transactions.id, date: transactions.date, incomeSourceId: transactions.incomeSourceId, recurringRuleId: transactions.recurringRuleId, expectedDate: transactions.expectedDate, matchSource: transactions.matchSource })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
  if (!row) throw new NotFoundError("Transaction");
  const before = { incomeSourceId: row.incomeSourceId, recurringRuleId: row.recurringRuleId, expectedDate: row.expectedDate, matchSource: row.matchSource };

  let expectedDate: string | null = null;
  if (ref) {
    const item = await loadItem(db, userId, ref);
    if (item.frequency !== "irregular") {
      // The nearest occurrence within about half a period that another hand-linked
      // row doesn't already hold; otherwise the row is linked but fulfils no date.
      const column = ref.kind === "income" ? transactions.incomeSourceId : transactions.recurringRuleId;
      const held = new Set(
        (
          await db
            .select({ expectedDate: transactions.expectedDate })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), eq(column, ref.id), eq(transactions.matchSource, "user"), ne(transactions.id, row.id), isNotNull(transactions.expectedDate)))
        ).map((r) => r.expectedDate!),
      );
      const reach = Math.max(MATCH_WINDOW_DAYS, LINK_REACH_DAYS[item.frequency]);
      expectedDate =
        occurrencesBetween(scheduleOf(item), addDays(row.date, -reach), addDays(row.date, reach))
          .filter((d) => !held.has(d))
          .sort((a, b) => Math.abs(daysBetween(a, row.date)) - Math.abs(daysBetween(b, row.date)) || a.localeCompare(b))[0] ?? null;
    }
  }

  try {
    await writeLink(db, userId, row.id, ref, expectedDate, before);
  } catch (err) {
    const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
    if (code === "23505") throw new ValidationError("That date is already matched to another transaction. Try again.");
    throw err;
  }
}

async function writeLink(
  db: Database,
  userId: string,
  rowId: string,
  ref: ItemRef | null,
  expectedDate: string | null,
  before: Record<string, unknown>,
): Promise<void> {
  const row = { id: rowId };
  await db.transaction(async (tx) => {
    if (ref && expectedDate) {
      // The user's choice wins: an automatic link holding this occurrence lets go.
      const column = ref.kind === "income" ? transactions.incomeSourceId : transactions.recurringRuleId;
      await tx
        .update(transactions)
        .set({ incomeSourceId: null, recurringRuleId: null, expectedDate: null, matchSource: null })
        .where(and(eq(transactions.userId, userId), eq(column, ref.id), eq(transactions.expectedDate, expectedDate), eq(transactions.matchSource, "auto"), ne(transactions.id, row.id)));
    }
    const after = {
      incomeSourceId: ref?.kind === "income" ? ref.id : null,
      recurringRuleId: ref?.kind === "recurring" ? ref.id : null,
      expectedDate,
      matchSource: ref ? ("user" as const) : ("dismissed" as const),
    };
    await tx.update(transactions).set(after).where(and(eq(transactions.id, row.id), eq(transactions.userId, userId)));
    await logActivity(tx, { userId, actor: "user", action: "transaction.link_recurring", entityType: "transaction", entityId: row.id, before, after });
  });
}

export type MatchOption = { ref: ItemRef; name: string; direction: "in" | "out" };

/** Active items a transaction can be linked to, by name. */
export async function listMatchOptions(db: Database, userId: string): Promise<MatchOption[]> {
  const { income, rules } = await activeItems(db, userId);
  return [
    ...income.map((i): MatchOption => ({ ref: { kind: "income", id: i.id }, name: i.name, direction: "in" })),
    ...rules.map((r): MatchOption => ({ ref: { kind: "recurring", id: r.id }, name: r.name, direction: "out" })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

