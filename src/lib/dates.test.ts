import { afterEach, describe, expect, it } from "vitest";
import { addDays, addMonths, dayOfWeek, daysBetween, formatDisplayDate, lastDayOfMonth, monthWindow, parseDateValue, todayInTimeZone, weekWindow } from "./dates";

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

describe("calendar math", () => {
  it("adds days across month, year, and leap boundaries", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-14", -14)).toBe("2026-10-31");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2026-11-14", "2026-11-28")).toBe(14);
    expect(daysBetween("2026-11-28", "2026-11-14")).toBe(-14);
  });
  it("knows the last day of each month", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });
  it("uses the user's timezone near midnight UTC", () => {
    const now = new Date("2026-11-16T03:30:00Z");
    expect(todayInTimeZone("America/Chicago", now)).toBe("2026-11-15");
    expect(todayInTimeZone("UTC", now)).toBe("2026-11-16");
  });
});

it("finds the day of the week, the week, and the month around a date", () => {
  expect(dayOfWeek("2026-01-01")).toBe(4);
  expect(dayOfWeek("2026-11-18")).toBe(3);
  expect(weekWindow("2026-11-18", 1)).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(weekWindow("2026-11-16", 1)).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  expect(weekWindow("2026-11-18", 0)).toEqual({ start: "2026-11-15", end: "2026-11-21" });
  expect(monthWindow("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
});

it("adds months with the day clamped to the month", () => {
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-11-30", 9)).toBe("2027-08-30");
  expect(addMonths("2027-02-28", -1)).toBe("2027-01-28");
  expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
});
