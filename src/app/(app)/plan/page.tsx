import { CalendarClock, PieChart } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { CreatePlan, type CreatePlanTemplate } from "@/components/plan/create-plan";
import { PlanBoard } from "@/components/plan/plan-board";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { getSettings } from "@/server/finance/settings";
import { getPlanStatus } from "@/server/plan/status-service";
import { PLAN_TEMPLATES, templateDrafts } from "@/server/plan/templates";
import type { IncomeSource } from "@/server/recurring/items-service";
import { getRecurringOverview } from "@/server/recurring/overview";

export const metadata = { title: "Plan · Finnance" };

export default async function PlanPage() {
  const user = await requireUser();
  const db = getDb();
  const settings = await getSettings(db, user.id);

  if (!settings.trackingStartDate) {
    return (
      <div className="rise">
        <PageHeader title="Plan" description="How your income gets put to work." />
        <EmptyState
          icon={PieChart}
          title="Set your tracking start date first"
          description="Plans run on the money that arrives from your start date onward. Set it on the Accounts page."
          action={
            <Button asChild variant="outline">
              <Link href="/accounts">Go to Accounts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [status, overview, accounts, categories] = await Promise.all([
    getPlanStatus(db, user.id),
    getRecurringOverview(db, user.id),
    listAccounts(db, user.id),
    listCategories(db, user.id),
  ]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  if (status) {
    const incomes = overview.income
      .filter((v) => status.incomes.some((i) => i.id === v.item.id))
      .map((v) => ({ id: v.item.id, name: v.name, accountId: v.item.accountId }));
    return (
      <div className="rise">
        <PageHeader title="Plan" description={status.plan.name} />
        <PlanBoard status={status} incomes={incomes} accounts={accountOptions} />
      </div>
    );
  }

  if (overview.income.length === 0) {
    return (
      <div className="rise">
        <PageHeader title="Plan" description="How your income gets put to work." />
        <EmptyState
          icon={CalendarClock}
          title="Add your income first"
          description="A plan splits the money you receive. Add a paycheck or any other income in Recurring (or log it as it arrives), then come back."
          action={
            <Button asChild variant="outline">
              <Link href="/recurring">Go to Recurring</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const templates: CreatePlanTemplate[] = PLAN_TEMPLATES.map((t) => {
    const drafts = templateDrafts(t.key, categories);
    return { key: t.key, name: t.name, description: t.description, cadence: t.cadence, buckets: drafts.buckets, extraIncomeBucket: drafts.extraIncomeBucket };
  });
  return (
    <div className="rise">
      <PageHeader title="Plan" description="How your income gets put to work. Start from a template and make it yours." />
      <CreatePlan
        templates={templates}
        incomes={overview.income.map((v) => ({
          id: v.item.id,
          name: v.name,
          frequency: (v.item as IncomeSource).frequency,
          typicalCents: v.amountCents,
          eventDates: v.recentMatches.map((m) => m.date),
        }))}
        accounts={accountOptions}
        billsMonthlyCents={overview.monthlyBillsCents}
      />
    </div>
  );
}
