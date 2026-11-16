/**
 * Per-request memos for the loads several Home widgets share (same db, user, and `now`),
 * so one Home render reads the plan, recurring items, and goals once each.
 * Outside a server render React's cache is a plain pass-through.
 */
import { cache } from "react";
import { getGoalsOverview } from "@/server/goals/overview";
import { getPlanStatus } from "@/server/plan/status-service";
import { getRecurringOverview } from "@/server/recurring/overview";

export const planStatusOnce = cache(getPlanStatus);
export const recurringOnce = cache(getRecurringOverview);
export const goalsOnce = cache(getGoalsOverview);
