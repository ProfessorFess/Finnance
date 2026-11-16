import { expect, it } from "vitest";
import { projectGoal } from "./projection";

const base = { targetCents: null, targetDate: null, startingCents: 0, contributions: [], plannedMonthlyCents: null, completed: false, today: "2026-11-30" };
const c = (date: string, amountCents: number) => ({ date, amountCents });

it("projects from the plan until there's 3 months of history", () => {
  expect(projectGoal({ ...base, targetCents: 1_000_000, startingCents: 250_000, contributions: [c("2026-11-13", 40_000), c("2026-11-27", 40_000)], plannedMonthlyCents: 80_000 })).toEqual({
    progressCents: 330_000, remainingCents: 670_000, percent: 0.33, reached: false, paceMonthlyCents: 80_000, paceBasis: "plan",
    projectedDate: "2027-08-30", neededMonthlyCents: null, chip: "on_track", horizon: "short",
  });
});
it("says when a goal is behind its date, and what it needs", () => {
  expect(projectGoal({ ...base, targetCents: 200_000, targetDate: "2027-02-28", startingCents: 50_000, plannedMonthlyCents: 20_000 })).toMatchObject({
    remainingCents: 150_000, projectedDate: "2027-07-30", neededMonthlyCents: 50_000, chip: "behind", horizon: "short",
  });
});
it("uses the recent pace once there's history, and can be ahead", () => {
  const contributions = ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"].map((d) => c(d, 10_000));
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2027-06-30", contributions, plannedMonthlyCents: 50_000 })).toMatchObject({
    progressCents: 50_000, paceMonthlyCents: 10_000, paceBasis: "actual", projectedDate: "2027-04-30", chip: "ahead",
  });
});
it("is on track when the plan lands right on the date", () => {
  expect(projectGoal({ ...base, targetCents: 1_200_000, targetDate: "2028-11-30", plannedMonthlyCents: 50_000 })).toMatchObject({
    projectedDate: "2028-11-30", neededMonthlyCents: 50_000, chip: "on_track", horizon: "long",
  });
});
it("shows progress only without a target", () => {
  expect(projectGoal({ ...base, contributions: [c("2026-11-20", 10_000)], plannedMonthlyCents: 5_000 })).toMatchObject({
    progressCents: 10_000, remainingCents: null, percent: null, projectedDate: null, chip: null,
  });
});
it("doesn't project without a pace", () => {
  expect(projectGoal({ ...base, targetCents: 100_000 })).toMatchObject({ paceMonthlyCents: null, projectedDate: null, chip: null, horizon: null });
  // A brand-new goal with a date but no plan or history isn't "behind" on day one (spec 7.5).
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2027-06-30" })).toMatchObject({ projectedDate: null, chip: null, neededMonthlyCents: 14_286 });
  // A target date already past still reads as behind.
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2026-10-31" })).toMatchObject({ chip: "behind" });
});
it("is done when reached or completed, and needs everything now past its date", () => {
  expect(projectGoal({ ...base, targetCents: 100_000, startingCents: 120_000 })).toMatchObject({ reached: true, chip: "done", percent: 1, projectedDate: null, remainingCents: 0 });
  expect(projectGoal({ ...base, targetCents: 100_000, completed: true }).chip).toBe("done");
  expect(projectGoal({ ...base, targetCents: 100_000, targetDate: "2026-10-31", plannedMonthlyCents: 10_000 })).toMatchObject({ neededMonthlyCents: 100_000, chip: "behind" });
});
