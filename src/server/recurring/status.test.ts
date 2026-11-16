import { expect, it } from "vitest";
import type { Schedule } from "./schedule";
import { itemStatus, planningAmount } from "./status";

const pay: Schedule = { frequency: "biweekly", anchorDate: "2026-11-13", secondDay: null };
const base = { schedule: pay, active: true, fulfilled: new Set<string>(), startDate: "2026-11-07" };
const m = (date: string, amountCents: number) => ({ date, amountCents });

it("does not call an occurrence late when no data covers it yet", () => {
  expect(itemStatus({ ...base, today: "2026-12-01", dataThrough: "2026-11-15" })).toEqual({
    state: "awaiting",
    nextDate: "2026-12-11",
    lateDates: [],
    awaitingDates: ["2026-11-13", "2026-11-27"],
  });
});
it("flags a missed paycheck once later data exists", () => {
  expect(itemStatus({ ...base, today: "2026-12-01", dataThrough: "2026-11-20" })).toMatchObject({ state: "late", lateDates: ["2026-11-13"], awaitingDates: ["2026-11-27"] });
});
it("an early payment fulfils its date and moves next forward", () => {
  expect(itemStatus({ ...base, fulfilled: new Set(["2026-11-13", "2026-11-27"]), today: "2026-11-26", dataThrough: "2026-11-26" })).toEqual({
    state: "upcoming",
    nextDate: "2026-12-11",
    lateDates: [],
    awaitingDates: [],
  });
});
it("ignores occurrences before the tracking start date", () => {
  expect(itemStatus({ ...base, schedule: { ...pay, anchorDate: "2026-10-02" }, today: "2026-11-14", dataThrough: "2026-11-14" }).awaitingDates).toEqual(["2026-11-13"]);
});
it("is due soon within 7 days, and paused items never go late", () => {
  expect(itemStatus({ ...base, fulfilled: new Set(["2026-11-13"]), today: "2026-11-21", dataThrough: "2026-11-21" }).state).toBe("due_soon");
  expect(itemStatus({ ...base, active: false, today: "2026-12-31", dataThrough: "2026-12-31" })).toMatchObject({ state: "paused", lateDates: [], awaitingDates: [] });
});
it("irregular items have no dates", () => {
  expect(itemStatus({ ...base, schedule: { frequency: "irregular", anchorDate: null, secondDay: null }, today: "2026-11-21", dataThrough: "2026-11-21" })).toEqual({
    state: "irregular",
    nextDate: null,
    lateDates: [],
    awaitingDates: [],
  });
});
it("plans with the user's estimate until 3 months of deposits exist", () => {
  expect(planningAmount({ mode: "estimated", expectedCents: 100_000, irregular: false, matches: [m("2026-10-01", 80_000)], today: "2026-11-14" })).toEqual({ cents: 100_000, basis: "estimate" });
  expect(
    planningAmount({ mode: "estimated", expectedCents: 100_000, irregular: false, matches: [m("2026-08-01", 80_000), m("2026-10-01", 90_000), m("2026-11-01", 120_000)], today: "2026-11-14" }),
  ).toEqual({ cents: 105_000, basis: "history" });
  expect(
    planningAmount({ mode: "estimated", expectedCents: 50_000, irregular: true, matches: [m("2026-08-01", 30_000), m("2026-09-01", 30_000), m("2026-10-20", 60_000)], today: "2026-11-14" }),
  ).toEqual({ cents: 30_000, basis: "history" });
  expect(planningAmount({ mode: "estimated", expectedCents: null, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: null, basis: "unknown" });
});
it("uses the set amount, or the latest deposit when it varies and none is set", () => {
  expect(planningAmount({ mode: "fixed", expectedCents: 120_000, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: 120_000, basis: "set" });
  expect(planningAmount({ mode: "fixed_rule", expectedCents: 2_164, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: 2_164, basis: "set" });
  expect(planningAmount({ mode: "varies", expectedCents: null, irregular: false, matches: [m("2026-11-14", 120_000)], today: "2026-11-14" })).toEqual({ cents: 120_000, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: null, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: null, basis: "unknown" });
});

it("plans a varying paycheck with its recent average, shown as approximate", () => {
  expect(planningAmount({ mode: "varies", expectedCents: 120_000, irregular: false, matches: [], today: "2026-11-14" })).toEqual({ cents: 120_000, basis: "estimate" });
  expect(
    planningAmount({ mode: "varies", expectedCents: 120_000, irregular: false, matches: [m("2026-10-02", 98_000), m("2026-10-16", 120_000), m("2026-10-30", 60_000)], today: "2026-11-14" }),
  ).toEqual({ cents: 92_667, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: 60_000, irregular: true, matches: [m("2026-11-01", 45_000), m("2026-11-10", 45_000)], today: "2026-11-14" })).toEqual({ cents: 60_000, basis: "set" });
});

it("plans irregular income as a monthly average of its deposits when no amount is set", () => {
  const four = [m("2026-10-20", 25_000), m("2026-10-27", 25_000), m("2026-11-03", 25_000), m("2026-11-10", 25_000)];
  expect(planningAmount({ mode: "varies", expectedCents: null, irregular: true, matches: four, today: "2026-11-14" })).toEqual({ cents: 100_000, basis: "history" });
  expect(planningAmount({ mode: "varies", expectedCents: 80_000, irregular: true, matches: four, today: "2026-11-14" })).toEqual({ cents: 80_000, basis: "set" });
});
