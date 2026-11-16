import type { GoalView } from "@/server/goals/overview";
import type { HomeWidget } from "@/server/home/dashboard-service";
import type { AttentionItem, SpendingByCategory as SpendingData, UpcomingItem } from "@/server/home/insights";
import type { SetupStatus } from "@/server/home/setup-service";
import type { TransactionRow } from "@/server/finance/transactions";
import type { BucketView } from "@/server/plan/status-service";
import { BucketStatus } from "./widgets/bucket-status";
import { GoalsWidget } from "./widgets/goals-widget";
import { NeedsAttention } from "./widgets/needs-attention";
import { PaycheckTasks, type PaycheckTasksData } from "./widgets/paycheck-tasks";
import { PlanOverview, type PlanOverviewData } from "./widgets/plan-overview";
import { RecentTransactions } from "./widgets/recent-transactions";
import { SetupCard } from "./widgets/setup-card";
import { SpendingByCategory } from "./widgets/spending-by-category";
import { Upcoming } from "./widgets/upcoming";

function Widget({ w }: { w: HomeWidget }) {
  const { size } = w;
  switch (w.type) {
    case "setup":
      return <SetupCard data={w.data as SetupStatus} size={size} />;
    case "bucket_status":
      return <BucketStatus data={w.data as BucketView | null} size={size} />;
    case "paycheck_tasks":
      return <PaycheckTasks data={w.data as PaycheckTasksData} size={size} />;
    case "plan_overview":
      return <PlanOverview data={w.data as PlanOverviewData} size={size} />;
    case "goals":
      return <GoalsWidget data={w.data as GoalView[]} size={size} />;
    case "upcoming":
      return <Upcoming data={w.data as UpcomingItem[]} size={size} />;
    case "spending_by_category":
      return <SpendingByCategory data={w.data as SpendingData} size={size} />;
    case "needs_attention":
      return <NeedsAttention data={w.data as AttentionItem[]} size={size} />;
    case "recent_transactions":
      return <RecentTransactions data={w.data as TransactionRow[]} size={size} />;
  }
}

/** Home's widgets on a 12-column grid (one column on phones), in the saved order. */
export function HomeGrid({ widgets }: { widgets: HomeWidget[] }) {
  return (
    <div data-testid="home-grid" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {widgets.map((w) => (
        <Widget key={w.id} w={w} />
      ))}
    </div>
  );
}
