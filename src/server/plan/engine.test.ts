import { expect, it } from "vitest";
import {
  type ActivityRow,
  allocationTasks,
  bucketActivity,
  type EngineBucket,
  fundIncome,
  incomesPerMonth,
  isExtraIncome,
  limitWindow,
  shareDestinations,
  suggestedFunding,
  planTypicalIncome,
  typicalPerIncome,
} from "./engine";

const b = (over: Partial<EngineBucket>): EngineBucket => ({ id: "x", role: "spending", fundingType: "fixed", fundingCents: null, fundingBps: null, limitCents: null, limitPeriod: null, trackCategoryIds: [], destinationAccountId: null, linkedRuleIds: [], linkedMonthlyCents: 0, ...over });
const sheet = [
  b({ id: "sav", role: "savings", fundingCents: 40_000, destinationAccountId: "ally-sav" }),
  b({ id: "bills", role: "bills", fundingType: "sum_of_recurring", linkedRuleIds: ["phone"], linkedMonthlyCents: 36_200 }),
  b({ id: "week", fundingCents: 40_000, limitCents: 20_000, limitPeriod: "weekly", trackCategoryIds: ["coffee", "bars"], destinationAccountId: "ally-spend" }),
  b({ id: "buf", role: "buffer", fundingType: "remainder" }),
];

it("counts incomes per month from schedules and from real payouts", () => {
  expect(incomesPerMonth([{ frequency: "biweekly", eventDates: [] }], "2026-11-20")).toBe(2);
  expect(incomesPerMonth([{ frequency: "semimonthly", eventDates: [] }, { frequency: "weekly", eventDates: [] }], "2026-11-20")).toBe(6);
  expect(incomesPerMonth([{ frequency: "irregular", eventDates: ["2026-11-03", "2026-11-10", "2026-11-17"] }], "2026-11-20")).toBe(3);
  expect(incomesPerMonth([{ frequency: "irregular", eventDates: [] }], "2026-11-20")).toBe(1);
  expect([isExtraIncome("biweekly", 3), isExtraIncome("biweekly", 2), isExtraIncome("weekly", 5), isExtraIncome("irregular", 9)]).toEqual([true, false, true, false]);
});
it("funds the spreadsheet's paycheck split", () => {
  const { funded, health } = fundIncome(sheet, 120_000, 2, null);
  expect(Object.fromEntries(funded)).toEqual({ sav: 40_000, bills: 18_100, week: 40_000, buf: 21_900 });
  expect(health).toEqual({ kind: "fully_allocated" });
});
it("splits a gig payout by percentages", () => {
  const gig = [b({ id: "tax", role: "savings", fundingType: "percent", fundingBps: 2_500 }), b({ id: "bills", fundingType: "sum_of_recurring", linkedMonthlyCents: 6_000 }), b({ id: "rest", fundingType: "remainder" })];
  expect(Object.fromEntries(fundIncome(gig, 25_000, 3, null).funded)).toEqual({ tax: 6_250, bills: 2_000, rest: 16_750 });
});
it("shows a shortfall as Over by, never a negative remainder", () => {
  const { funded, health } = fundIncome(sheet, 50_000, 2, null);
  expect(funded.get("buf")).toBe(0);
  expect(health).toEqual({ kind: "over", cents: 48_100 });
});
it("reports unassigned money when there's no remainder bucket, and routes an extra income", () => {
  expect(fundIncome([b({ id: "p", fundingType: "percent", fundingBps: 1_000 }), b({ id: "f", fundingCents: 50_000 })], 120_000, 2, null).health).toEqual({ kind: "unassigned", cents: 58_000 });
  expect(Object.fromEntries(fundIncome(sheet, 120_000, 2, { bucketId: "sav", bps: 10_000 }).funded)).toEqual({ sav: 120_000, bills: 0, week: 0, buf: 0 });
});
it("picks each limit's window", () => {
  expect(limitWindow("weekly", "2026-11-18", 1, "2026-11-14", "2026-11-07")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(limitWindow("monthly", "2026-11-18", 1, null, "2026-11-07")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  expect(limitWindow("per_income", "2026-11-18", 1, "2026-11-14", "2026-11-07")).toEqual({ start: "2026-11-14", end: "2026-11-18" });
  expect(limitWindow("per_income", "2026-11-18", 1, null, "2026-11-07")).toEqual({ start: "2026-11-07", end: "2026-11-18" });
});
it("suggests funding from a limit", () => {
  expect(suggestedFunding(20_000, "weekly", 2, "per_income")).toBe(40_000);
  expect(suggestedFunding(50_000, "monthly", 2, "per_income")).toBe(25_000);
  expect(suggestedFunding(20_000, "weekly", 1, "monthly")).toBe(86_667);
});
it("counts tracked spending in the week, net of refunds, skipping transfers", () => {
  const row = (date: string, amountCents: number, categoryId: string | null, over: Partial<ActivityRow> = {}): ActivityRow => ({ date, amountCents, accountId: "chk", categoryId, isTransfer: false, recurringRuleId: null, ...over });
  const rows = [row("2026-11-16", -625, "coffee"), row("2026-11-18", -900, "bars"), row("2026-11-19", 300, "coffee"), row("2026-11-17", -5_000, "groceries"), row("2026-11-17", -1_000, "coffee", { isTransfer: true }), row("2026-11-15", -700, "coffee")];
  expect(bucketActivity(sheet[2]!, rows, { start: "2026-11-16", end: "2026-11-22" })).toBe(1_225);
});
it("counts moves into savings, and bills paid from whichever bucket they belong to", () => {
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 40_000, accountId: "ally-sav", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-13", amountCents: 10, accountId: "ally-sav", categoryId: null, isTransfer: false, recurringRuleId: null },
    { date: "2026-11-15", amountCents: -10_000, accountId: "chk", categoryId: "phone-cat", isTransfer: false, recurringRuleId: "phone" },
    { date: "2026-11-16", amountCents: -1_549, accountId: "chk", categoryId: "subs", isTransfer: false, recurringRuleId: "netflix" },
  ];
  const w = { start: "2026-11-13", end: "2026-11-26" };
  expect(bucketActivity(sheet[0]!, rows, w)).toBe(40_000);
  expect(bucketActivity(sheet[1]!, rows, w)).toBe(10_000);
  expect(bucketActivity(b({ trackCategoryIds: ["subs"], linkedRuleIds: ["netflix"] }), rows, w)).toBe(1_549);
});
it("makes a move task per destination and ticks it off when the transfer lands", () => {
  const { funded } = fundIncome(sheet, 120_000, 2, null);
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 40_000, accountId: "ally-sav", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-14", amountCents: 15_000, accountId: "ally-spend", categoryId: null, isTransfer: true, recurringRuleId: null },
  ];
  expect(allocationTasks(sheet, funded, rows, { start: "2026-11-13", end: "2026-11-26" })).toEqual([
    { bucketId: "sav", amountCents: 40_000, movedCents: 40_000, destinationAccountId: "ally-sav", done: true },
    { bucketId: "week", amountCents: 40_000, movedCents: 15_000, destinationAccountId: "ally-spend", done: false },
  ]);
});

it("shares one destination's transfers across the buckets that move there", () => {
  const two = [
    b({ id: "emergency", role: "savings", fundingCents: 10_000, destinationAccountId: "sav" }),
    b({ id: "vacation", role: "savings", fundingCents: 10_000, destinationAccountId: "sav" }),
  ];
  const { funded } = fundIncome(two, 50_000, 2, null);
  const rows: ActivityRow[] = [{ date: "2026-11-13", amountCents: 10_000, accountId: "sav", categoryId: null, isTransfer: true, recurringRuleId: null }];
  expect(allocationTasks(two, funded, rows, { start: "2026-11-13", end: "2026-11-26" }).map((t) => [t.bucketId, t.movedCents, t.done])).toEqual([
    ["emergency", 10_000, true],
    ["vacation", 0, false],
  ]);
  expect(shareDestinations([
    { id: "a", destinationAccountId: "sav", targetCents: 10_000, inflowCents: 25_000 },
    { id: "b", destinationAccountId: "sav", targetCents: 10_000, inflowCents: 25_000 },
    { id: "c", destinationAccountId: "other", targetCents: 40_000, inflowCents: 50_000 },
  ])).toEqual(new Map([["a", 10_000], ["b", 15_000], ["c", 50_000]]));
});

it("finds a typical income from recent deposits, else from what's expected", () => {
  expect(typicalPerIncome([{ date: "2026-11-03", amountCents: 30_000 }, { date: "2026-11-10", amountCents: 45_000 }, { date: "2026-11-17", amountCents: 25_000 }], [], "2026-11-20")).toBe(33_333);
  expect(typicalPerIncome([{ date: "2026-05-01", amountCents: 99_000 }], [120_000, 80_000], "2026-11-20")).toBe(100_000);
  expect(typicalPerIncome([], [], "2026-11-20")).toBeNull();
});

it("the create preview and the Plan page agree on a typical income", () => {
  // A gig worker: the irregular source's planning amount is a monthly figure; per income, recent payouts win.
  const payouts = [{ date: "2026-11-03", amountCents: 30_000 }, { date: "2026-11-10", amountCents: 45_000 }, { date: "2026-11-17", amountCents: 25_000 }];
  const gig = [{ frequency: "irregular" as const, planningCents: 100_000, events: payouts }];
  expect(planTypicalIncome("per_income", gig, "2026-11-20")).toBe(33_333);
  expect(planTypicalIncome("monthly", gig, "2026-11-20")).toBe(100_000);
  const household = [
    { frequency: "semimonthly" as const, planningCents: 150_000, events: [] },
    { frequency: "irregular" as const, planningCents: 60_000, events: [] },
  ];
  expect(planTypicalIncome("monthly", household, "2026-11-20")).toBe(360_000);
  expect(planTypicalIncome("monthly", [{ frequency: "irregular" as const, planningCents: null, events: [] }], "2026-11-20")).toBeNull();
});

it("a buffer with a destination tracks moves; without one it tracks spending", () => {
  const rows: ActivityRow[] = [
    { date: "2026-11-13", amountCents: 20_000, accountId: "buffer-acct", categoryId: null, isTransfer: true, recurringRuleId: null },
    { date: "2026-11-14", amountCents: -3_000, accountId: "chk", categoryId: "shopping", isTransfer: false, recurringRuleId: null },
  ];
  const w = { start: "2026-11-13", end: "2026-11-26" };
  expect(bucketActivity(b({ role: "buffer", destinationAccountId: "buffer-acct", trackCategoryIds: ["shopping"] }), rows, w)).toBe(20_000);
  expect(bucketActivity(b({ role: "buffer", trackCategoryIds: ["shopping"] }), rows, w)).toBe(3_000);
});
