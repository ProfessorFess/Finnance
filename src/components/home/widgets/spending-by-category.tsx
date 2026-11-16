import { formatCents } from "@/lib/money";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { SpendingByCategory as Data } from "@/server/home/insights";
import { Bar, WidgetEmpty, WidgetFrame } from "../widget-frame";

const TOP = 6;

export function SpendingByCategory({ data, size }: { data: Data; size: WidgetSize }) {
  const top = data.rows.slice(0, TOP);
  const rest = data.rows.slice(TOP).reduce((s, r) => s + r.cents, 0);
  const rows = rest > 0 ? [...top, { categoryId: "other", name: "Other", cents: rest }] : top;
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <WidgetFrame title="Spending by category" size={size} href={rows.length ? "/transactions" : undefined}>
      {rows.length === 0 ? (
        <WidgetEmpty text="No spending yet this month." />
      ) : (
        <>
          <div>
            <p className="num text-2xl font-semibold">{formatCents(data.totalCents)}</p>
            <p className="text-sm text-muted-foreground">
              {data.firstMonth
                ? "Your first month"
                : `this month · vs. ${formatCents(data.previousTotalCents ?? 0)} last month`}
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.categoryId ?? "uncategorized"} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="num">{formatCents(r.cents)}</span>
                </div>
                <Bar share={r.cents / max} />
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetFrame>
  );
}
