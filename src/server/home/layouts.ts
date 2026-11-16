/**
 * Starting Home layouts are data, keyed by plan template, then cadence, then "none" (no plan).
 * A new budgeting method gets a new entry here; nothing else names a widget order.
 */
import type { PlanCadence, PlanTemplate, WidgetSize } from "@/server/db/finance-schema";
import type { WidgetType } from "./registry";

export type LayoutWidget = { type: WidgetType; size: WidgetSize; config?: Record<string, unknown> };

const after = (...w: LayoutWidget[]): LayoutWidget[] => [
  ...w,
  { type: "goals", size: "md" },
  { type: "upcoming", size: "md" },
  { type: "spending_by_category", size: "md" },
  { type: "needs_attention", size: "md" },
  { type: "recent_transactions", size: "full" },
];

export const STARTING_LAYOUTS: Record<string, LayoutWidget[]> = {
  // The spreadsheet's order: what's left this week first, then this paycheck's moves.
  paycheck_plan: after(
    { type: "bucket_status", size: "lg" },
    { type: "paycheck_tasks", size: "sm" },
    { type: "plan_overview", size: "full" },
  ),
  per_income: after({ type: "paycheck_tasks", size: "md" }, { type: "plan_overview", size: "md" }),
  monthly: after({ type: "plan_overview", size: "full" }),
  none: [
    { type: "needs_attention", size: "md" },
    { type: "upcoming", size: "md" },
    { type: "goals", size: "md" },
    { type: "spending_by_category", size: "md" },
    { type: "recent_transactions", size: "full" },
  ],
};

/** Which starting layout fits the active plan. */
export function layoutKeyFor(plan: { template: PlanTemplate; cadence: PlanCadence } | null): string {
  if (!plan) return "none";
  return Object.hasOwn(STARTING_LAYOUTS, plan.template) ? plan.template : plan.cadence;
}
