import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PlanCadence } from "@/server/db/finance-schema";
import type { BucketView } from "@/server/plan/status-service";
import { BucketIcon } from "./plan-icons";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
};
const WINDOW_WORDS = { weekly: "this week", monthly: "this month", per_income: "since your last income" } as const;
const PER_WORDS = { weekly: "per week", monthly: "per month", per_income: "per income" } as const;

export function BucketCard({ bucket, cadence, children }: { bucket: BucketView; cadence: PlanCadence; children?: React.ReactNode }) {
  const saving = bucket.role === "savings" || bucket.role === "goal";
  const over = bucket.remainingCents !== null && bucket.remainingCents < 0;
  const share = bucket.limitCents ? Math.min(1, bucket.activityCents / bucket.limitCents) : 0;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BucketIcon name={bucket.icon} className="size-4" />
        </div>
        <h3 className="min-w-0 flex-1 truncate font-medium">{bucket.name}</h3>
        {children}
      </div>

      {bucket.role === "bills" && !bucket.limitPeriod && bucket.limitCents !== null ? (
        <p className={cn("num text-2xl font-semibold", over && "text-destructive")}>
          {formatCents(bucket.activityCents)} <span className="text-base font-normal text-muted-foreground">of {formatCents(bucket.limitCents)} paid this month</span>
        </p>
      ) : saving && !bucket.destinationAccountName && bucket.limitPeriod === null ? (
        <p className="text-sm text-muted-foreground">Choose where it moves to in Edit plan.</p>
      ) : saving && bucket.limitCents !== null ? (
        <p className="num text-2xl font-semibold">
          {formatCents(bucket.activityCents)} <span className="text-base font-normal text-muted-foreground">of {formatCents(bucket.limitCents)} moved</span>
        </p>
      ) : bucket.remainingCents !== null ? (
        <p className={cn("num text-2xl font-semibold", over && "text-destructive")}>
          {over ? `${formatCents(-bucket.remainingCents)} over` : `${formatCents(bucket.remainingCents)} left`}{" "}
          <span className="text-base font-normal text-muted-foreground">{bucket.limitPeriod ? WINDOW_WORDS[bucket.limitPeriod] : "this income"}</span>
        </p>
      ) : (
        <p className="num text-2xl font-semibold">
          {formatCents(bucket.activityCents)} <span className="text-base font-normal text-muted-foreground">spent</span>
        </p>
      )}

      {bucket.limitCents !== null && bucket.limitCents > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${share * 100}%` }} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {bucket.limitPeriod && bucket.limitCents !== null && (
          <span>
            {formatCents(bucket.limitCents)} {PER_WORDS[bucket.limitPeriod]}
            {bucket.resetsOn ? ` · resets ${bucket.limitPeriod === "weekly" ? weekday(bucket.resetsOn) : formatDisplayDate(bucket.resetsOn)}` : ""}
            {" · "}
          </span>
        )}
        Gets {bucket.fundingType === "remainder" ? "what's left" : bucket.fundingType === "sum_of_recurring" ? "its bills" : formatCents(bucket.typicalFundedCents ?? bucket.draft.fundingCents ?? bucket.fundedCents)}
        {bucket.fundingType === "remainder" || bucket.fundingType === "sum_of_recurring" ? ` (≈ ${formatCents(bucket.typicalFundedCents ?? bucket.draft.fundingCents ?? bucket.fundedCents)})` : ""}{" "}
        {cadence === "monthly" ? "each month" : "from each income"}
        {bucket.destinationAccountName ? ` · moves to ${bucket.destinationAccountName}` : ""}
        {bucket.fundsGoals.length ? ` · funds ${bucket.fundsGoals.join(", ")}` : ""}
      </p>
    </li>
  );
}
