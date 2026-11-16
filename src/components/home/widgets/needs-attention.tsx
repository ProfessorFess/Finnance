import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { AttentionItem } from "@/server/home/insights";
import { WidgetEmpty, WidgetFrame } from "../widget-frame";

export function NeedsAttention({ data, size }: { data: AttentionItem[]; size: WidgetSize }) {
  return (
    <WidgetFrame title="Needs attention" size={size}>
      {data.length === 0 ? (
        <WidgetEmpty text="All caught up." />
      ) : (
        <ul className="flex flex-col gap-1">
          {data.map((i, n) => (
            <li key={`${i.key}:${n}`}>
              <Link href={i.href} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <span className="flex-1">{i.text}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
