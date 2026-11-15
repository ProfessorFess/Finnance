import { eq } from "drizzle-orm";
import { parseDateValue } from "@/lib/dates";
import { userSettings } from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "./activity";
import { ValidationError } from "./errors";

export type Settings = { trackingStartDate: string | null; timezone: string; weekStartDay: number };

/** The user's settings, creating the default row on first read. */
export async function getSettings(db: Database, userId: string): Promise<Settings> {
  await db.insert(userSettings).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return { trackingStartDate: row!.trackingStartDate, timezone: row!.timezone, weekStartDay: row!.weekStartDay };
}

/** Sets the day tracking starts; bank rows before it are skipped on import. */
export async function setTrackingStartDate(db: Database, userId: string, date: string): Promise<void> {
  if (parseDateValue(date, "YYYY-MM-DD") === null) throw new ValidationError("Enter a valid start date");
  const before = await getSettings(db, userId);
  await db.transaction(async (tx) => {
    await tx.update(userSettings).set({ trackingStartDate: date }).where(eq(userSettings.userId, userId));
    await logActivity(tx, {
      userId,
      actor: "user",
      action: "settings.start_date",
      entityType: "settings",
      entityId: userId,
      before: { trackingStartDate: before.trackingStartDate },
      after: { trackingStartDate: date },
    });
  });
}

/** The tracking start date without creating a settings row (null when unset). */
export async function getTrackingStartDate(db: Executor, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ d: userSettings.trackingStartDate })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.d ?? null;
}
