import { expect, it } from "vitest";
import { PLAN_TEMPLATES, templateDrafts } from "./templates";

it("ships the paycheck plan and start-from-scratch as data", () => {
  expect(PLAN_TEMPLATES.map((t) => t.key)).toEqual(["paycheck_plan", "custom"]);
  const d = templateDrafts("paycheck_plan", [
    { id: "c1", name: "Coffee" },
    { id: "c2", name: "Bars" },
  ]);
  expect(d.cadence).toBe("per_income");
  expect(d.buckets.map((x) => x.name)).toEqual(["Savings & investing", "Bills", "Weekly spending", "Goal fund / buffer"]);
  expect(d.buckets[2]).toMatchObject({ limitPeriod: "weekly", trackCategoryIds: ["c1", "c2"] });
  expect(d.extraIncomeBucket).toBe(0);
  expect(templateDrafts("custom", []).buckets).toEqual([expect.objectContaining({ name: "Whatever's left", fundingType: "remainder" })]);
  expect(templateDrafts("custom", []).cadence).toBeNull();
});
