import { GOAL_CHIPS } from "@/components/goals/chips";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { GoalView } from "@/server/goals/overview";
import { Bar, WidgetEmpty, WidgetFrame } from "../widget-frame";

export function GoalsWidget({ data, size }: { data: GoalView[]; size: WidgetSize }) {
  return (
    <WidgetFrame title="Goals" size={size} href={data.length ? "/goals" : undefined}>
      {data.length === 0 ? (
        <WidgetEmpty text="Nothing to save toward yet." href="/goals" action="Add a goal" />
      ) : (
        <ul className="flex flex-col gap-4">
          {data.map((g) => {
            const p = g.projection;
            const chip = p.chip ? GOAL_CHIPS[p.chip] : null;
            return (
              <li key={g.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{g.name}</span>
                  {chip && <Badge variant={chip.variant}>{chip.text}</Badge>}
                </div>
                <p className="num text-sm text-muted-foreground">
                  {formatCents(p.progressCents)}
                  {g.targetCents !== null ? ` of ${formatCents(g.targetCents)}` : " saved"}
                </p>
                {p.percent !== null && <Bar share={p.percent} danger={p.chip === "behind"} />}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetFrame>
  );
}
