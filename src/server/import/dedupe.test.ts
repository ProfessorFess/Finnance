import { expect, it } from "vitest";
import { assignOccurrences, dedupeHash } from "./dedupe";
import type { ParsedRow } from "./types";

const base: ParsedRow = {
  line: 0, date: "2026-11-13", amountCents: -625, description: "Bennu Coffee",
  pending: false, bankCategory: null, accountNumber: null, externalId: null,
};

it("numbers identical rows in file order", () => {
  const r = (d: string) => ({ ...base, description: d });
  expect(assignOccurrences([r("Bennu Coffee"), r("Other"), r("Bennu Coffee")]).map((x) => x.occurrence)).toEqual([0, 0, 1]);
});

it("hashes by external id when present", () => {
  expect(dedupeHash("acc", { ...base, externalId: "A1" }, 0)).toBe("ext:A1");
});

it("hashes the same row the same way, and different occurrences differently", () => {
  expect(dedupeHash("acc", base, 0)).toBe(dedupeHash("acc", { ...base, line: 99, description: "BENNU COFFEE" }, 0));
  expect(dedupeHash("acc", base, 0)).not.toBe(dedupeHash("acc", base, 1));
  expect(dedupeHash("acc", base, 0)).not.toBe(dedupeHash("other", base, 0));
});
