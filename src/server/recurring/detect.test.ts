import { expect, it } from "vitest";
import { type DetectRow, detectRecurring } from "./detect";

const r = (date: string, amountCents: number, merchant = "Netflix"): DetectRow => ({ date, amountCents, merchant, accountId: "chk", categoryId: "subs" });

it("spots a steady monthly subscription", () => {
  expect(detectRecurring(["2026-08-03", "2026-09-03", "2026-10-03", "2026-11-03"].map((d) => r(d, -1549)), "2026-11-15")).toEqual([
    { merchantKey: "netflix", merchant: "Netflix", direction: "out", frequency: "monthly", amountCents: 1549, amountVaries: false, count: 4, lastDate: "2026-11-03", nextDate: "2026-12-03", accountId: "chk", categoryId: "subs" },
  ]);
});
it("spots a biweekly paycheck that varies", () => {
  const rows = (
    [
      ["2026-09-18", 60_000],
      ["2026-10-02", 98_000],
      ["2026-10-16", 120_000],
      ["2026-10-30", 110_000],
      ["2026-11-13", 100_000],
    ] as const
  ).map(([d, c]) => r(d, c, "Acme Payroll"));
  expect(detectRecurring(rows, "2026-11-15")[0]).toMatchObject({ direction: "in", frequency: "biweekly", amountCents: 100_000, amountVaries: true, nextDate: "2026-11-27" });
});
it("keeps money in and money out from the same merchant apart", () => {
  const out = ["2026-08-03", "2026-09-03", "2026-10-03"].map((d) => r(d, -1000, "Venmo"));
  expect(detectRecurring([...out, r("2026-10-10", 5000, "Venmo")], "2026-10-15")).toHaveLength(1);
});
it("ignores irregular spending, stale patterns, and short histories", () => {
  expect(detectRecurring(["2026-10-01", "2026-10-04", "2026-10-24", "2026-11-14"].map((d) => r(d, -900, "Haymaker")), "2026-11-15")).toEqual([]);
  expect(detectRecurring(["2026-03-03", "2026-04-03", "2026-05-03"].map((d) => r(d, -999)), "2026-11-15")).toEqual([]);
  expect(detectRecurring(["2026-10-03", "2026-11-03"].map((d) => r(d, -999)), "2026-11-15")).toEqual([]);
});
