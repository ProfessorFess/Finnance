import type { GoalStatus, GoalType, PlannedPer } from "@/server/db/finance-schema";
import type { Projection } from "@/server/goals/projection";

/** A goal as the page shows it (serializable). */
export type GoalCardView = {
  id: string;
  name: string;
  type: GoalType;
  icon: string;
  status: GoalStatus;
  targetCents: number | null;
  targetDate: string | null;
  startingCents: number;
  startDate: string;
  plannedCents: number | null;
  plannedPer: PlannedPer | null;
  fundedByBucketId: string | null;
  trackAccountId: string | null;
  trackCategoryId: string | null;
  projection: Projection;
  trackLabel: string | null;
  rollOverTo: string | null;
  askDone: boolean;
  recent: { id: string; date: string; amountCents: number; source: "manual" | "auto" | "linked"; counted: boolean; note: string | null }[];
};

export type Option = { id: string; name: string };
export type BucketOption = Option & { destinationAccountId: string | null };
