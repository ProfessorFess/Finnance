import { afterEach, expect, it } from "vitest";
import { formatDisplayDate, parseDateValue } from "./dates";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

it.each([
  ["2026-11-14", "YYYY-MM-DD", "2026-11-14"], ["11/14/2026", "MM/DD/YYYY", "2026-11-14"],
  ["1/5/2026", "M/D/YYYY", "2026-01-05"], ["14/11/2026", "DD/MM/YYYY", "2026-11-14"],
  ["02/29/2028", "MM/DD/YYYY", "2028-02-29"],
] as const)("parseDateValue(%j, %s) -> %s", (raw, fmt, iso) => expect(parseDateValue(raw, fmt)).toBe(iso));

it.each([["02/30/2026", "MM/DD/YYYY"], ["13/01/2026", "MM/DD/YYYY"], ["2026-11-14", "MM/DD/YYYY"], ["", "YYYY-MM-DD"]] as const)(
  "rejects %j as %s", (raw, fmt) => expect(parseDateValue(raw, fmt)).toBeNull());

it("parses calendar dates without timezone shifts", () => {
  for (const tz of ["America/Chicago", "UTC", "Pacific/Kiritimati"]) {
    process.env.TZ = tz;
    expect(parseDateValue("11/14/2026", "MM/DD/YYYY")).toBe("2026-11-14");
    expect(formatDisplayDate("2026-11-14")).toBe("Nov 14, 2026");
  }
});
