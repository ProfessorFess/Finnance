import { expect, it } from "vitest";
import { matchRule, type RuleLike } from "./rules";

const r = (p: Partial<RuleLike>): RuleLike => ({
  id: crypto.randomUUID(), matchType: "description_contains", pattern: "x", categoryId: "c",
  priority: 10, createdFrom: "default", createdAt: new Date(0), ...p,
});

it("prefers higher priority, then the user's rules over built-ins", () => {
  const eats = r({ pattern: "uber eats", categoryId: "restaurants", priority: 20 });
  const uber = r({ pattern: "uber", categoryId: "rideshare" });
  expect(matchRule([uber, eats], { merchant: "Uber Eats", description: "Uber Eats" })?.categoryId).toBe("restaurants");
  const mine = r({ pattern: "uber", categoryId: "travel", createdFrom: "user", priority: 10 });
  expect(matchRule([uber, mine], { merchant: "Uber", description: "Uber" })?.categoryId).toBe("travel");
});

it("matches merchant_equals on the cleaned merchant, case-insensitively", () => {
  expect(matchRule([r({ matchType: "merchant_equals", pattern: "corner store" })], { merchant: "Corner Store", description: "CORNER STORE 101 MAIN ST" })).not.toBeNull();
  expect(matchRule([r({ matchType: "merchant_equals", pattern: "corner" })], { merchant: "Corner Store", description: "CORNER STORE" })).toBeNull();
});

it("ignores an invalid regex", () => {
  expect(matchRule([r({ matchType: "regex", pattern: "(" })], { merchant: null, description: "(" })).toBeNull();
});

it("matches regex rules case-insensitively", () => {
  expect(matchRule([r({ matchType: "regex", pattern: "\\bATM\\b" })], { merchant: null, description: "atm withdrawal" })).not.toBeNull();
});
