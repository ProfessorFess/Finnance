import { formatCents } from "@/lib/money";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { UpcomingItem } from "@/server/home/insights";
import { WidgetEmpty, WidgetFrame } from "../widget-frame";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function Upcoming({ data, size }: { data: UpcomingItem[]; size: WidgetSize }) {
  return (
    <WidgetFrame title="Upcoming" size={size} href="/recurring">
      {data.length === 0 ? (
        <WidgetEmpty text="Nothing expected in the next two weeks." />
      ) : (
        <ul className="flex flex-col divide-y">
          {data.map((i) => (
            <li key={`${i.kind}:${i.name}:${i.date}`} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <span className="num w-14 shrink-0 text-muted-foreground">{short(i.date)}</span>
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className={i.kind === "income" ? "num font-medium text-positive" : "num font-medium"}>
                {i.amountCents === null ? "varies" : `${i.kind === "income" ? "+" : ""}${formatCents(i.amountCents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
