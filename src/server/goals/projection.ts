/**
 * Goal projections (pure). Progress is the starting amount plus what was
 * actually contributed; the pace is the recent 3-month average once that much
 * history exists, else the plan (spec 7.5: "say so"), else unknown.
 */
import { addDays, addMonths, daysBetween } from "@/lib/dates";

export type ProjectionInput = {
  targetCents: number | null;
  targetDate: string | null;
  startingCents: number;
  /** Counted contributions only. */
  contributions: { date: string; amountCents: number }[];
  plannedMonthlyCents: number | null;
  completed: boolean;
  today: string;
};

export type GoalChip = "done" | "ahead" | "on_track" | "behind";

export type Projection = {
  progressCents: number;
  remainingCents: number | null;
  percent: number | null;
  reached: boolean;
  paceMonthlyCents: number | null;
  paceBasis: "actual" | "plan" | null;
  projectedDate: string | null;
  neededMonthlyCents: number | null;
  chip: GoalChip | null;
  horizon: "short" | "long" | null;
};

const LOOKBACK_DAYS = 90;
const DAYS_PER_MONTH = 30.4375;

export function projectGoal(input: ProjectionInput): Projection {
  const { targetCents, targetDate, today } = input;
  const progressCents = input.startingCents + input.contributions.reduce((s, c) => s + c.amountCents, 0);
  const reached = targetCents !== null && progressCents >= targetCents;
  const remainingCents = targetCents === null ? null : Math.max(0, targetCents - progressCents);
  const percent = targetCents === null ? null : Math.min(1, Math.max(0, progressCents / targetCents));

  // Pace: 3 months of real contributions, else the plan.
  const since = addDays(today, -LOOKBACK_DAYS);
  const dates = input.contributions.map((c) => c.date).sort();
  let paceMonthlyCents: number | null = null;
  let paceBasis: Projection["paceBasis"] = null;
  if (dates.length && dates[0]! <= since) {
    const recent = input.contributions.filter((c) => c.date >= since && c.date <= today).reduce((s, c) => s + c.amountCents, 0);
    paceMonthlyCents = Math.round(recent / 3);
    paceBasis = "actual";
  } else if (input.plannedMonthlyCents !== null) {
    paceMonthlyCents = input.plannedMonthlyCents;
    paceBasis = "plan";
  }
  if (paceMonthlyCents !== null && paceMonthlyCents <= 0) {
    paceMonthlyCents = null;
    paceBasis = null;
  }

  const projectedDate =
    !reached && remainingCents !== null && remainingCents > 0 && paceMonthlyCents !== null ? addMonths(today, Math.ceil(remainingCents / paceMonthlyCents)) : null;

  let neededMonthlyCents: number | null = null;
  if (targetDate && !reached && remainingCents !== null && remainingCents > 0) {
    const days = daysBetween(today, targetDate);
    neededMonthlyCents = days <= 0 ? remainingCents : Math.ceil(remainingCents / Math.max(1, Math.round(days / DAYS_PER_MONTH)));
  }

  let chip: GoalChip | null = null;
  if (reached || input.completed) chip = "done";
  else if (targetCents === null) chip = null;
  else if (targetDate) {
    // A target date already past is behind; with no pace yet (a new goal), there's nothing to judge.
    if (targetDate < today) chip = "behind";
    else if (!projectedDate) chip = paceMonthlyCents === null ? null : "behind";
    else if (projectedDate <= addMonths(targetDate, -1)) chip = "ahead";
    else if (projectedDate <= targetDate) chip = "on_track";
    else chip = "behind";
  } else chip = paceMonthlyCents !== null ? "on_track" : null;

  const horizonDate = targetDate ?? projectedDate;
  const horizon = horizonDate ? (daysBetween(today, horizonDate) <= 365 ? "short" : "long") : null;

  return { progressCents, remainingCents, percent, reached, paceMonthlyCents, paceBasis, projectedDate, neededMonthlyCents, chip, horizon };
}
