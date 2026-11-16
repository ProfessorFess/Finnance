import { Goal as GoalIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { GoalsBoard } from "@/components/goals/goals-board";
import type { GoalCardView } from "@/components/goals/types";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { getSettings } from "@/server/finance/settings";
import { getGoalsOverview, type GoalView } from "@/server/goals/overview";
import { getActivePlan } from "@/server/plan/plans-service";

export const metadata = { title: "Goals · Finnance" };

function cardOf(g: GoalView): GoalCardView {
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    icon: g.icon,
    status: g.status,
    targetCents: g.targetCents,
    targetDate: g.targetDate,
    startingCents: g.startingCents,
    startDate: g.startDate,
    plannedCents: g.plannedCents,
    plannedPer: g.plannedPer,
    fundedByBucketId: g.fundedByBucketId,
    trackAccountId: g.trackAccountId,
    trackCategoryId: g.trackCategoryId,
    projection: g.projection,
    trackLabel: g.trackLabel,
    rollOverTo: g.rollOverTo,
    recent: g.recent.map((c) => ({ id: c.id, date: c.date, amountCents: c.amountCents, source: c.source, counted: c.counted, note: c.note })),
  };
}

export default async function GoalsPage() {
  const user = await requireUser();
  const db = getDb();
  const settings = await getSettings(db, user.id);
  if (!settings.trackingStartDate) {
    return (
      <div className="rise">
        <PageHeader title="Goals" description="What you're saving toward, in order." />
        <EmptyState
          icon={GoalIcon}
          title="Set your tracking start date first"
          description="Goals count the money you move from your start date onward. Set it on the Accounts page."
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">Go to Accounts</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const [overview, accounts, categories, plan] = await Promise.all([
    getGoalsOverview(db, user.id),
    listAccounts(db, user.id),
    listCategories(db, user.id),
    getActivePlan(db, user.id),
  ]);
  return (
    <div className="rise">
      <PageHeader title="Goals" description="What you're saving toward, in order." />
      <GoalsBoard
        goals={overview.goals.map(cardOf)}
        totalSavedCents={overview.totalSavedCents}
        today={overview.today}
        defaultStartDate={settings.trackingStartDate}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        buckets={(plan?.buckets ?? []).map((b) => ({ id: b.id, name: b.name, destinationAccountId: b.destinationAccountId }))}
      />
    </div>
  );
}
