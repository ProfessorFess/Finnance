import { BucketIcon } from "@/components/plan/plan-icons";
import { HealthChip } from "@/components/plan/health-chip";
import { formatCents } from "@/lib/money";
import type { PlanCadence, WidgetSize } from "@/server/db/finance-schema";
import type { PlanStatus } from "@/server/plan/status-service";
import { Bar, WidgetEmpty, WidgetFrame } from "../widget-frame";

export type PlanOverviewData = Pick<PlanStatus, "buckets" | "health" | "typicalIncomeCents"> & { cadence: PlanCadence } | null;

/** Every bucket at a glance. */
export function PlanOverview({ data, size }: { data: PlanOverviewData; size: WidgetSize }) {
  if (!data)
    return (
      <WidgetFrame title="Plan" size={size}>
        <WidgetEmpty text="Split your income into buckets: savings, bills, spending, and whatever's left." href="/plan" action="Make a plan" />
      </WidgetFrame>
    );
  return (
    <WidgetFrame title="Plan" size={size} href="/plan">
      <HealthChip health={data.health} typicalCents={data.typicalIncomeCents} cadence={data.cadence} />
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.buckets.map((b) => {
          const saving = b.role === "savings" || b.role === "goal";
          const over = b.remainingCents !== null && b.remainingCents < 0;
          const value = saving
            ? `${formatCents(b.activityCents)} moved`
            : b.remainingCents !== null
              ? over
                ? `${formatCents(-b.remainingCents)} over`
                : `${formatCents(b.remainingCents)} left`
              : `${formatCents(b.activityCents)} spent`;
          return (
            <li key={b.id} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm">
                <BucketIcon name={b.icon} className="size-4 shrink-0 text-primary" />
                <span className="truncate">{b.name}</span>
              </div>
              <p className={over ? "num font-medium text-destructive" : "num font-medium"}>{value}</p>
              {b.limitCents !== null && b.limitCents > 0 && <Bar share={b.activityCents / b.limitCents} danger={over} />}
            </li>
          );
        })}
      </ul>
    </WidgetFrame>
  );
}
