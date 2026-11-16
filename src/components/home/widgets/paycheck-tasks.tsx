import { CheckCircle2, Circle } from "lucide-react";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { PlanCadence, PlanTemplate, WidgetSize } from "@/server/db/finance-schema";
import type { PlanStatus } from "@/server/plan/status-service";
import { WidgetEmpty, WidgetFrame } from "../widget-frame";

export type PaycheckTasksData = Pick<PlanStatus, "latestIncome" | "month" | "tasks" | "nextExpected" | "problem"> & {
  template: PlanTemplate;
  cadence: PlanCadence;
} | null;

export function paycheckTasksTitle(d: PaycheckTasksData): string {
  if (d?.cadence === "monthly") return "This month";
  return d?.template === "paycheck_plan" ? "Paycheck tasks" : "Income tasks";
}

/** The latest income (or this month) and the moves it asks for. */
export function PaycheckTasks({ data, size }: { data: PaycheckTasksData; size: WidgetSize }) {
  const title = data ? paycheckTasksTitle(data) : "Paycheck tasks";
  if (!data)
    return (
      <WidgetFrame title={title} size={size}>
        <WidgetEmpty text="Make a plan to get a checklist of moves for each income." href="/plan" action="Make a plan" />
      </WidgetFrame>
    );
  return (
    <WidgetFrame title={title} size={size} href="/plan">
      {data.problem === "no_income" ? (
        <WidgetEmpty text="Your plan has no income yet." href="/plan" action="Choose one" />
      ) : data.latestIncome ? (
        <div>
          <p className="text-sm text-muted-foreground">
            {data.latestIncome.sourceName} · {formatDisplayDate(data.latestIncome.date)}
          </p>
          <p className="num text-2xl font-semibold text-primary">{formatCents(data.latestIncome.amountCents)}</p>
        </div>
      ) : data.month ? (
        <p className="num text-2xl font-semibold">
          {formatCents(data.month.receivedCents)} <span className="text-base font-normal text-muted-foreground">received</span>
        </p>
      ) : (
        <WidgetEmpty text="Waiting for your first income." />
      )}
      {data.tasks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.tasks.map((t) => (
            <li key={t.bucketId} className="flex items-start gap-2 text-sm">
              {t.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span className={t.done ? "text-muted-foreground" : undefined}>
                Move <span className="num font-medium">{formatCents(t.amountCents)}</span> to {t.destinationAccountName}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        data.latestIncome && <p className="text-sm text-muted-foreground">No moves to make for this income.</p>
      )}
      {data.nextExpected && (
        <p className="text-xs text-muted-foreground">
          Next: {data.nextExpected.sourceName} {formatDisplayDate(data.nextExpected.date)}
          {data.nextExpected.amountCents !== null ? `, ≈ ${formatCents(data.nextExpected.amountCents)}` : ""}
        </p>
      )}
    </WidgetFrame>
  );
}
