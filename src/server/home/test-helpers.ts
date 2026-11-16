import type { Database } from "@/server/db/types";
import { createPlan } from "@/server/plan/plans-service";
import type { BucketDraft } from "@/server/plan/templates";
import { createIncomeSource } from "@/server/recurring/items-service";

const draft = (over: Partial<BucketDraft> & Pick<BucketDraft, "name" | "role">): BucketDraft => ({
  icon: "wallet", fundingType: "fixed", fundingCents: null, fundingBps: null, limitCents: null, limitPeriod: null, trackCategoryIds: [],
  destinationAccountId: null, ...over,
});

/** A household unlike the owner's: a monthly salary and a monthly plan. `limits: false` leaves every bucket without a limit. */
export async function monthlyPlan(db: Database, userId: string, accountId: string, opts: { limits?: boolean; cadence?: "monthly" | "per_income" } = {}) {
  const salary = await createIncomeSource(db, userId, {
    name: "Salary", type: "salary", frequency: "monthly", anchorDate: "2026-11-01", secondDay: null, amountMode: "fixed",
    expectedCents: 400_000, accountId, categoryId: null, matchPattern: "Salary Co",
  });
  const limits = opts.limits ?? true;
  await createPlan(db, userId, {
    template: "custom", cadence: opts.cadence ?? "monthly", name: "Monthly budget", incomeSourceIds: [salary.id], extraIncome: null,
    buckets: [
      draft({ name: "Rent", role: "bills", fundingCents: 150_000 }),
      draft({ name: "Groceries", role: "spending", fundingCents: 60_000, ...(limits ? { limitCents: 60_000, limitPeriod: "monthly" as const } : {}) }),
      draft({ name: "Everything else", role: "buffer", fundingType: "remainder" }),
    ],
  });
}
