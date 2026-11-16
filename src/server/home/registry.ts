/**
 * Widget types are code; which widgets a dashboard shows, and their settings, are data
 * (dashboard_widgets rows). Each type here says what settings it takes and how to load
 * its data from the user's records. Settings that point at a bucket or goal fall back
 * gracefully when that bucket or goal is gone.
 */
import { z } from "zod";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { Database } from "@/server/db/types";
import { listTransactions } from "@/server/finance/transactions";
import { goalsOnce, planStatusOnce } from "./cached";
import { getNeedsAttention, getSpendingByCategory, getUpcoming } from "./insights";
import { getSetupStatus } from "./setup-service";

export type WidgetType =
  | "setup"
  | "bucket_status"
  | "paycheck_tasks"
  | "plan_overview"
  | "goals"
  | "upcoming"
  | "spending_by_category"
  | "needs_attention"
  | "recent_transactions";

export type WidgetDef<S, D> = {
  key: WidgetType;
  title: string;
  sizes: WidgetSize[];
  settings: z.ZodType<S>;
  defaults: S;
  load(db: Database, userId: string, settings: S, now: Date): Promise<D>;
};

const def = <S, D>(d: WidgetDef<S, D>) => d;
const empty = z.object({}).strip();

export const WIDGETS = {
  setup: def({
    key: "setup",
    title: "Finish setting up",
    sizes: ["full"],
    settings: empty,
    defaults: {},
    load: (db, userId) => getSetupStatus(db, userId),
  }),
  bucket_status: def({
    key: "bucket_status",
    title: "Spending left",
    sizes: ["md", "lg", "full"],
    settings: z.object({ bucketId: z.string().nullable().default(null) }),
    defaults: { bucketId: null },
    async load(db, userId, s, now) {
      const plan = await planStatusOnce(db, userId, now);
      if (!plan) return null;
      // The user's own limit (a bills bucket shows a computed one).
      const limited = plan.buckets.filter((b) => b.draft.limitCents !== null);
      return (
        plan.buckets.find((b) => b.id === s.bucketId) ?? limited.find((b) => b.draft.limitPeriod === "weekly") ?? limited[0] ?? null
      );
    },
  }),
  paycheck_tasks: def({
    key: "paycheck_tasks",
    title: "Paycheck tasks",
    sizes: ["sm", "md", "lg"],
    settings: empty,
    defaults: {},
    async load(db, userId, _s, now) {
      const p = await planStatusOnce(db, userId, now);
      return p && { template: p.plan.template, cadence: p.plan.cadence, latestIncome: p.latestIncome, month: p.month, tasks: p.tasks, nextExpected: p.nextExpected, problem: p.problem };
    },
  }),
  plan_overview: def({
    key: "plan_overview",
    title: "Plan",
    sizes: ["md", "lg", "full"],
    settings: empty,
    defaults: {},
    async load(db, userId, _s, now) {
      const p = await planStatusOnce(db, userId, now);
      return p && { buckets: p.buckets, health: p.health, typicalIncomeCents: p.typicalIncomeCents, cadence: p.plan.cadence };
    },
  }),
  goals: def({
    key: "goals",
    title: "Goals",
    sizes: ["sm", "md", "lg", "full"],
    settings: z.object({ goalId: z.string().nullable().default(null), limit: z.number().int().min(1).max(10).default(3) }),
    defaults: { goalId: null, limit: 3 },
    async load(db, userId, s, now) {
      const { goals } = await goalsOnce(db, userId, now);
      const one = goals.find((g) => g.id === s.goalId);
      // Finished goals stay on the Goals page; Home shows what is still in progress.
      return one ? [one] : goals.filter((g) => g.status !== "completed").slice(0, s.limit);
    },
  }),
  upcoming: def({
    key: "upcoming",
    title: "Upcoming",
    sizes: ["sm", "md", "lg"],
    settings: z.object({ days: z.number().int().min(1).max(60).default(14) }),
    defaults: { days: 14 },
    load: (db, userId, s, now) => getUpcoming(db, userId, now, s.days),
  }),
  spending_by_category: def({
    key: "spending_by_category",
    title: "Spending by category",
    sizes: ["md", "lg", "full"],
    settings: empty,
    defaults: {},
    load: (db, userId, _s, now) => getSpendingByCategory(db, userId, now),
  }),
  needs_attention: def({
    key: "needs_attention",
    title: "Needs attention",
    sizes: ["sm", "md", "lg"],
    settings: empty,
    defaults: {},
    load: (db, userId, _s, now) => getNeedsAttention(db, userId, now),
  }),
  recent_transactions: def({
    key: "recent_transactions",
    title: "Recent transactions",
    sizes: ["md", "lg", "full"],
    settings: z.object({ limit: z.number().int().min(1).max(25).default(8) }),
    defaults: { limit: 8 },
    load: async (db, userId, s) => (await listTransactions(db, userId, { limit: s.limit })).items,
  }),
} satisfies Record<WidgetType, { key: WidgetType; title: string }>;

export const isWidgetType = (t: string): t is WidgetType => Object.hasOwn(WIDGETS, t);

/** Loads one widget's data. Bad settings fall back to the type's defaults; an unknown type is null. */
export async function loadWidget(
  db: Database,
  userId: string,
  w: { type: string; config: unknown },
  now: Date = new Date(),
): Promise<{ type: WidgetType; data: unknown } | null> {
  if (!isWidgetType(w.type)) return null;
  const d = WIDGETS[w.type] as WidgetDef<unknown, unknown>;
  const parsed = d.settings.safeParse(w.config ?? {});
  return { type: w.type, data: await d.load(db, userId, parsed.success ? parsed.data : d.defaults, now) };
}
