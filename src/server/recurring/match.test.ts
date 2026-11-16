import { expect, it } from "vitest";
import { defaultToleranceCents } from "./schedule";
import { findMatches, type MatchCandidate, type MatchItem, matchesPattern } from "./match";

const paycheckItem: MatchItem = {
  ref: { kind: "income", id: "pay" },
  direction: "in",
  schedule: { frequency: "biweekly", anchorDate: "2026-11-13", secondDay: null },
  pattern: "Payroll Acme Corp",
  accountId: "chk",
  amount: { mode: "any" },
  allowTransfers: false,
};
const tx = (id: string, date: string, amountCents: number, description: string, over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id,
  date,
  amountCents,
  accountId: "chk",
  description,
  merchant: description,
  isTransfer: false,
  ...over,
});
const monthly = (id: string, anchorDate: string, pattern: string, amount: MatchItem["amount"], over: Partial<MatchItem> = {}): MatchItem => ({
  ref: { kind: "recurring", id },
  direction: "out",
  schedule: { frequency: "monthly", anchorDate, secondDay: null },
  pattern,
  accountId: null,
  amount,
  allowTransfers: false,
  ...over,
});
const near = (cents: number, toleranceCents = 200): MatchItem["amount"] => ({ mode: "near", cents, toleranceCents });
const win = { from: "2026-11-01", to: "2026-12-31" };

it("matches patterns as whole words in the description or merchant", () => {
  expect(matchesPattern("payroll acme", { description: "PAYROLL ACME CORP 1234", merchant: null })).toBe(true);
  expect(matchesPattern("uber", { description: "Huber's Diner", merchant: "Huber's Diner" })).toBe(false);
  expect(matchesPattern("Netflix", { description: "NFLX 12345", merchant: "Netflix" })).toBe(true);
});

it("matches a varying paycheck that arrives a day early", () => {
  expect(findMatches([paycheckItem], [tx("a", "2026-11-12", 98_000, "Payroll Acme Corp"), tx("b", "2026-11-26", 20_000, "Payroll Acme Corp")], [], win)).toEqual([
    { transactionId: "a", ref: paycheckItem.ref, expectedDate: "2026-11-13" },
    { transactionId: "b", ref: paycheckItem.ref, expectedDate: "2026-11-27" },
  ]);
});

it("ignores rows outside ±3 days, the wrong direction, or another account", () => {
  const rows = [
    tx("a", "2026-11-17", 98_000, "Payroll Acme Corp"),
    tx("b", "2026-11-13", -98_000, "Payroll Acme Corp"),
    tx("c", "2026-11-13", 98_000, "Payroll Acme Corp", { accountId: "sav" }),
  ];
  expect(findMatches([paycheckItem], rows, [], win)).toEqual([]);
});

it("assigns same-merchant charges to the item whose amount fits", () => {
  const small = monthly("small", "2026-11-03", "apple.com/bill", near(99));
  const big = monthly("big", "2026-11-03", "apple.com/bill", near(999));
  const links = findMatches([small, big], [tx("x", "2026-11-03", -999, "APPLE.COM/BILL"), tx("y", "2026-11-04", -99, "APPLE.COM/BILL")], [], win);
  expect(links).toHaveLength(2);
  expect(links).toContainEqual({ transactionId: "x", ref: big.ref, expectedDate: "2026-11-03" });
  expect(links).toContainEqual({ transactionId: "y", ref: small.ref, expectedDate: "2026-11-03" });
});

it("one transaction per occurrence, nearest first", () => {
  const netflix = monthly("nf", "2026-11-04", "Netflix", near(1549));
  expect(findMatches([netflix], [tx("late", "2026-11-05", -1549, "Netflix"), tx("early", "2026-11-03", -1549, "Netflix")], [], win)).toEqual([
    { transactionId: "early", ref: netflix.ref, expectedDate: "2026-11-04" },
  ]);
});

it("respects occurrences already fulfilled", () => {
  expect(findMatches([paycheckItem], [tx("a", "2026-11-12", 98_000, "Payroll Acme Corp")], [{ ref: paycheckItem.ref, expectedDate: "2026-11-13" }], win)).toEqual([]);
});

it("tolerates a price change within 20% but not a different charge", () => {
  const netflix = monthly("nf", "2026-11-03", "Netflix", near(1549, defaultToleranceCents(1549)));
  expect(findMatches([netflix], [tx("a", "2026-11-03", -1799, "Netflix")], [], win)).toHaveLength(1);
  expect(findMatches([netflix], [tx("a", "2026-11-03", -2500, "Netflix")], [], win)).toEqual([]);
});

it("links every deposit of irregular income, with no expected date", () => {
  const venmo: MatchItem = { ...paycheckItem, ref: { kind: "income", id: "venmo" }, schedule: { frequency: "irregular", anchorDate: null, secondDay: null }, pattern: "Venmo" };
  const links = findMatches([venmo], [tx("a", "2026-11-02", 5_000, "Venmo Cashout"), tx("b", "2026-11-20", 7_000, "Venmo Cashout"), tx("c", "2026-11-21", -3_000, "Venmo Payment")], [], win);
  expect(links).toEqual([
    { transactionId: "a", ref: venmo.ref, expectedDate: null },
    { transactionId: "b", ref: venmo.ref, expectedDate: null },
  ]);
});

it("only transfer items take transfer-paired rows", () => {
  const bill = monthly("bill", "2026-11-12", "Transfer To Share", { mode: "any" });
  const move = monthly("move", "2026-11-12", "Transfer To Share", { mode: "any" }, { allowTransfers: true });
  expect(findMatches([bill, move], [tx("a", "2026-11-12", -10_000, "Withdrawal Internet Banking Transfer To Share 0001", { isTransfer: true })], [], win)).toEqual([
    { transactionId: "a", ref: move.ref, expectedDate: "2026-11-12" },
  ]);
});
