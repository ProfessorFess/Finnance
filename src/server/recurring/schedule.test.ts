import { expect, it } from "vitest";
import { defaultToleranceCents, type Frequency, monthlyEquivalentCents, nextOccurrence, occurrencesBetween, type Schedule } from "./schedule";

const s = (frequency: Frequency, anchorDate: string | null, secondDay: number | null = null): Schedule => ({ frequency, anchorDate, secondDay });

it("steps biweekly from the anchor and never before it", () => {
  expect(occurrencesBetween(s("biweekly", "2026-11-13"), "2026-11-01", "2026-12-31")).toEqual(["2026-11-13", "2026-11-27", "2026-12-11", "2026-12-25"]);
  expect(occurrencesBetween(s("biweekly", "2026-11-13"), "2026-10-01", "2026-11-12")).toEqual([]);
});
it("steps weekly and starts mid-range on the right day", () => {
  expect(occurrencesBetween(s("weekly", "2026-10-01"), "2026-11-01", "2026-11-20")).toEqual(["2026-11-05", "2026-11-12", "2026-11-19"]);
});
it("keeps a 31st anchor at month end without drifting", () => {
  expect(occurrencesBetween(s("monthly", "2026-01-31"), "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});
it("handles twice-a-month days, including 'last day'", () => {
  expect(occurrencesBetween(s("semimonthly", "2026-11-15", 31), "2026-11-01", "2026-12-31")).toEqual(["2026-11-15", "2026-11-30", "2026-12-15", "2026-12-31"]);
  expect(occurrencesBetween(s("semimonthly", "2026-11-20", 5), "2026-11-01", "2026-12-31")).toEqual(["2026-11-20", "2026-12-05", "2026-12-20"]);
});
it("handles quarterly and leap-day yearly anchors", () => {
  expect(occurrencesBetween(s("quarterly", "2026-01-15"), "2026-01-01", "2026-08-01")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
  expect(occurrencesBetween(s("yearly", "2024-02-29"), "2025-01-01", "2028-12-31")).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});
it("irregular income has no expected dates", () => {
  expect(occurrencesBetween(s("irregular", null), "2026-01-01", "2026-12-31")).toEqual([]);
  expect(nextOccurrence(s("irregular", null), "2026-11-14")).toBeNull();
});
it("finds the next occurrence", () => {
  expect(nextOccurrence(s("biweekly", "2026-11-13"), "2026-11-14")).toBe("2026-11-27");
  expect(nextOccurrence(s("biweekly", "2026-11-13"), "2026-10-01")).toBe("2026-11-13");
  expect(nextOccurrence(s("monthly", "2026-01-31"), "2026-03-01")).toBe("2026-03-31");
});
it("converts to a monthly equivalent", () => {
  expect(monthlyEquivalentCents(120_000, "biweekly")).toBe(260_000);
  expect(monthlyEquivalentCents(2_000, "weekly")).toBe(8_667);
  expect(monthlyEquivalentCents(1_200, "yearly")).toBe(100);
});
it("tolerates price changes of up to 20% (at least $2)", () => {
  expect(defaultToleranceCents(1_549)).toBe(310);
  expect(defaultToleranceCents(500)).toBe(200);
});
