import { and, asc, eq } from "drizzle-orm";
import { budgetPlans, dashboards, dashboardWidgets, type WidgetSize } from "@/server/db/schema";
import type { Database, Executor } from "@/server/db/types";
import { logActivity } from "@/server/finance/activity";
import { layoutKeyFor, STARTING_LAYOUTS } from "./layouts";
import { loadWidget, type WidgetType } from "./registry";
import { getSetupStatus } from "./setup-service";

export type StoredWidget = { id: string; type: string; config: unknown; size: WidgetSize };
export type HomeWidget = { id: string; size: WidgetSize; type: WidgetType; data: unknown };

async function insertLayout(tx: Executor, userId: string, dashboardId: string, key: string) {
  const layout = STARTING_LAYOUTS[key] ?? STARTING_LAYOUTS.none!;
  await tx.insert(dashboardWidgets).values(
    layout.map((w, position) => ({ userId, dashboardId, type: w.type, config: w.config ?? {}, size: w.size, position })),
  );
}

/**
 * The user's Home dashboard, created from the starting layout for their plan. Until they customize it,
 * the layout follows the plan: a new template or cadence swaps in that layout.
 */
export async function ensureHomeDashboard(db: Database, userId: string): Promise<{ dashboardId: string; widgets: StoredWidget[] }> {
  const [plan] = await db
    .select({ template: budgetPlans.template, cadence: budgetPlans.cadence })
    .from(budgetPlans)
    .where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.active, true)));
  const key = layoutKeyFor(plan ?? null);

  let [dash] = await db.select().from(dashboards).where(and(eq(dashboards.userId, userId), eq(dashboards.isDefault, true)));
  if (!dash) {
    await db.transaction(async (tx) => {
      const [made] = await tx.insert(dashboards).values({ userId, layoutKey: key }).onConflictDoNothing().returning();
      if (!made) return; // Another request made it first.
      await insertLayout(tx, userId, made.id, key);
      await logActivity(tx, { userId, actor: "system", action: "dashboard.create", entityType: "dashboard", entityId: made.id, after: { layoutKey: key } });
    });
    [dash] = await db.select().from(dashboards).where(and(eq(dashboards.userId, userId), eq(dashboards.isDefault, true)));
  } else if (!dash.customized && dash.layoutKey !== key) {
    const d = dash;
    await db.transaction(async (tx) => {
      await tx.delete(dashboardWidgets).where(and(eq(dashboardWidgets.dashboardId, d.id), eq(dashboardWidgets.userId, userId)));
      await insertLayout(tx, userId, d.id, key);
      await tx.update(dashboards).set({ layoutKey: key, updatedAt: new Date() }).where(eq(dashboards.id, d.id));
      await logActivity(tx, {
        userId, actor: "system", action: "dashboard.reset", entityType: "dashboard", entityId: d.id, before: { layoutKey: d.layoutKey }, after: { layoutKey: key },
      });
    });
  }
  const widgets = await db
    .select({ id: dashboardWidgets.id, type: dashboardWidgets.type, config: dashboardWidgets.config, size: dashboardWidgets.size })
    .from(dashboardWidgets)
    .where(and(eq(dashboardWidgets.dashboardId, dash!.id), eq(dashboardWidgets.userId, userId)))
    .orderBy(asc(dashboardWidgets.position));
  return { dashboardId: dash!.id, widgets };
}

/** Everything Home shows: each widget's data, with a setup card first while setup isn't finished. */
export async function loadHome(db: Database, userId: string, now: Date = new Date()): Promise<{ widgets: HomeWidget[]; setupIncomplete: boolean }> {
  const [{ widgets }, setup] = await Promise.all([ensureHomeDashboard(db, userId), getSetupStatus(db, userId)]);
  const loaded = await Promise.all(
    widgets.map(async (w) => {
      const r = await loadWidget(db, userId, w, now);
      return r && { id: w.id, size: w.size, type: r.type, data: r.data };
    }),
  );
  const shown = loaded.filter((w): w is HomeWidget => w !== null);
  if (!setup.complete) shown.unshift({ id: "setup", size: "full", type: "setup", data: setup });
  return { widgets: shown, setupIncomplete: !setup.complete };
}
