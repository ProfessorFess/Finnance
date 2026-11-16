import { WINDOW_WORDS, weekday } from "@/components/plan/bucket-card";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { BucketView } from "@/server/plan/status-service";
import { Bar, WidgetEmpty, WidgetFrame } from "../widget-frame";

/** The one number that matters most: what's left to spend in a bucket. */
export function BucketStatus({ data, size }: { data: BucketView | null; size: WidgetSize }) {
  if (!data)
    return (
      <WidgetFrame title="Spending left" size={size}>
        <WidgetEmpty text="Make a plan with a spending limit to see what's left to spend." href="/plan" action="Go to Plan" />
      </WidgetFrame>
    );
  const period = data.draft.limitPeriod;
  const remaining = data.remainingCents ?? 0;
  const over = remaining < 0;
  return (
    <WidgetFrame title={data.name} size={size} href="/plan">
      <p className={cn("num text-5xl font-semibold tracking-tight sm:text-6xl", over && "text-destructive")}>
        {formatCents(over ? -remaining : remaining)}
      </p>
      <p className="-mt-2 text-lg text-muted-foreground">
        {over ? "over" : "left"} {period ? WINDOW_WORDS[period] : "this income"}
      </p>
      {data.limitCents !== null && data.limitCents > 0 && <Bar share={data.activityCents / data.limitCents} danger={over} />}
      <p className="text-sm text-muted-foreground">
        {formatCents(data.activityCents)} spent of {formatCents(data.limitCents ?? 0)}
        {data.resetsOn ? ` · resets ${period === "weekly" ? weekday(data.resetsOn) : formatDisplayDate(data.resetsOn)}` : ""}
      </p>
    </WidgetFrame>
  );
}
