/**
 * Plan templates are data: starting bucket lists the user (or the assistant)
 * edits before and after creating a plan. Nothing else in the app branches on
 * a template key; new budgeting methods are new entries here.
 */
import type { BucketRole, FundingType, LimitPeriod, PlanCadence, PlanTemplate } from "@/server/db/finance-schema";

export type BucketDraft = {
  name: string;
  role: BucketRole;
  icon: string;
  fundingType: FundingType;
  /** Per income, or per month in a monthly plan. */
  fundingCents: number | null;
  fundingBps: number | null;
  limitCents: number | null;
  limitPeriod: LimitPeriod | null;
  trackCategoryIds: string[];
  destinationAccountId: string | null;
};

type TemplateBucket = Omit<BucketDraft, "trackCategoryIds" | "destinationAccountId"> & { trackCategoryNames: string[] };

export type PlanTemplateDef = {
  key: PlanTemplate;
  name: string;
  description: string;
  /** null = the user chooses. */
  cadence: PlanCadence | null;
  buckets: TemplateBucket[];
  /** Index of the bucket an extra paycheck goes to, if any. */
  extraIncomeBucket: number | null;
};

const bucket = (over: Partial<TemplateBucket> & Pick<TemplateBucket, "name" | "role" | "icon" | "fundingType">): TemplateBucket => ({
  fundingCents: null,
  fundingBps: null,
  limitCents: null,
  limitPeriod: null,
  trackCategoryNames: [],
  ...over,
});

export const PLAN_TEMPLATES: PlanTemplateDef[] = [
  {
    key: "paycheck_plan",
    name: "Paycheck plan",
    description: "Split each paycheck into savings, bills, weekly spending, and a buffer.",
    cadence: "per_income",
    buckets: [
      bucket({ name: "Savings & investing", role: "savings", icon: "piggy-bank", fundingType: "fixed" }),
      bucket({ name: "Bills", role: "bills", icon: "receipt", fundingType: "sum_of_recurring" }),
      bucket({
        name: "Weekly spending",
        role: "spending",
        icon: "coffee",
        fundingType: "fixed",
        limitPeriod: "weekly",
        trackCategoryNames: ["Coffee", "Restaurants", "Bars", "Shopping"],
      }),
      bucket({ name: "Goal fund / buffer", role: "buffer", icon: "shield", fundingType: "remainder" }),
    ],
    extraIncomeBucket: 0,
  },
  {
    key: "custom",
    name: "Start from scratch",
    description: "Your own buckets, split from each income or budgeted each month.",
    cadence: null,
    buckets: [bucket({ name: "Whatever's left", role: "buffer", icon: "wallet", fundingType: "remainder" })],
    extraIncomeBucket: null,
  },
];

/** A template's starting drafts, with category names resolved to the user's ids. */
export function templateDrafts(
  key: PlanTemplate,
  categories: { id: string; name: string }[],
): { cadence: PlanCadence | null; buckets: BucketDraft[]; extraIncomeBucket: number | null } {
  const template = PLAN_TEMPLATES.find((t) => t.key === key);
  if (!template) return { cadence: null, buckets: [], extraIncomeBucket: null };
  const idOf = new Map(categories.map((c) => [c.name, c.id]));
  return {
    cadence: template.cadence,
    buckets: template.buckets.map(({ trackCategoryNames, ...b }) => ({
      ...b,
      trackCategoryIds: trackCategoryNames.flatMap((n) => (idOf.has(n) ? [idOf.get(n)!] : [])),
      destinationAccountId: null,
    })),
    extraIncomeBucket: template.extraIncomeBucket,
  };
}
