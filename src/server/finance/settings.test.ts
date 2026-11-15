import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { getSettings, setTrackingStartDate } from "./settings";

let t: Awaited<ReturnType<typeof createTestDb>>;
let userA: string;
let userB: string;

beforeEach(async () => {
  t = await createTestDb();
  userA = (await createTestUser(t.db)).id;
  userB = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

it("creates default settings on first read", async () => {
  expect(await getSettings(t.db, userA)).toEqual({ trackingStartDate: null, timezone: "America/Chicago", weekStartDay: 1 });
});

it("stores the tracking start date", async () => {
  await setTrackingStartDate(t.db, userA, "2026-11-07");
  expect((await getSettings(t.db, userA)).trackingStartDate).toBe("2026-11-07");
});

it.each(["11/07/2026", "2026-02-30", ""])("rejects invalid start date %j", async (d) => {
  await expect(setTrackingStartDate(t.db, userA, d)).rejects.toThrow(/date/i);
});

it("isolates users", async () => {
  await setTrackingStartDate(t.db, userA, "2026-11-07");
  expect((await getSettings(t.db, userB)).trackingStartDate).toBeNull();
});
