import { and, desc, eq } from "drizzle-orm";
import { activityLog } from "@/server/db/schema";
import type { Executor } from "@/server/db/types";

export type ActivityEntry = typeof activityLog.$inferSelect;

export type ActivityInput = {
  userId: string;
  actor: "user" | "system";
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/** Records one data change. Call it inside the same transaction as the change. */
export async function logActivity(db: Executor, entry: ActivityInput): Promise<void> {
  await db.insert(activityLog).values({ ...entry, before: entry.before ?? null, after: entry.after ?? null });
}

/** Changes to one entity, newest first. */
export async function listActivity(
  db: Executor,
  userId: string,
  entityType: string,
  entityId: string,
): Promise<ActivityEntry[]> {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.userId, userId), eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id));
}
