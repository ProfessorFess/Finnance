import { expect, it } from "vitest";
import { formatCents, parseAmountToCents } from "./money";

it.each([
  ["20.84", 2084], ["-16.40", -1640], ["0.01", 1], ["1,234.56", 123456], ["$5", 500], ["(12.00)", -1200],
  [" 2650.00 ", 265000], ["-0.5", -50], ["100", 10000],
])("parseAmountToCents(%j) -> %j", (raw, cents) => expect(parseAmountToCents(raw)).toBe(cents));

it.each(["", "N/A", "12.345", "1.2.3", "abc"])("rejects %j", (raw) => expect(parseAmountToCents(raw)).toBeNull());

it("formats cents", () => {
  expect(formatCents(123456)).toBe("$1,234.56");
  expect(formatCents(-1640)).toBe("-$16.40");
  expect(formatCents(1000, { sign: "always" })).toBe("+$10.00");
  expect(formatCents(0)).toBe("$0.00");
});
