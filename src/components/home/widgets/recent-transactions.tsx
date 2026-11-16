import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { TransactionRow } from "@/server/finance/transactions";
import { WidgetEmpty, WidgetFrame } from "../widget-frame";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export function RecentTransactions({ data, size }: { data: TransactionRow[]; size: WidgetSize }) {
  return (
    <WidgetFrame title="Recent transactions" size={size} href={data.length ? "/transactions" : undefined}>
      {data.length === 0 ? (
        <WidgetEmpty text="Import your bank files to see transactions here." href="/import" action="Import" />
      ) : (
        <ul className="flex flex-col divide-y">
          {data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <span className="num w-14 shrink-0 text-muted-foreground">{short(r.date)}</span>
              <span className="min-w-0 flex-1 truncate">{r.description}</span>
              <span className={cn("num font-medium", r.amountCents > 0 && "text-positive")}>{formatCents(r.amountCents, { sign: r.amountCents > 0 ? "always" : undefined })}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
