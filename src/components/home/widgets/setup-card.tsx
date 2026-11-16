import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { WidgetSize } from "@/server/db/finance-schema";
import type { SetupStatus } from "@/server/home/setup-service";
import { WidgetFrame } from "../widget-frame";

export function SetupCard({ data, size }: { data: SetupStatus; size: WidgetSize }) {
  const done = data.steps.filter((s) => s.done).length;
  const next = data.steps.find((s) => s.key === data.nextStep);
  // Mostly set up: one line, so the numbers that matter stay at the top.
  if (next && done >= data.steps.length / 2)
    return (
      <WidgetFrame title="Finish setting up" size={size}>
        <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="num text-muted-foreground">
            {done} of {data.steps.length} done
          </span>
          <span className="flex-1">Next: {next.title}</span>
          <Button asChild size="sm" variant="outline">
            <Link href={next.href}>Continue setup</Link>
          </Button>
        </div>
      </WidgetFrame>
    );
  return (
    <WidgetFrame title="Finish setting up" size={size}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-medium">A few steps and Home fills itself in from your bank files.</p>
        <span className="num text-sm text-muted-foreground">
          {done} of {data.steps.length}
        </span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
              {s.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : s.skipped ? (
                <MinusCircle className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={s.done ? "text-muted-foreground line-through" : undefined}>{s.title}</span>
              {s.skipped && !s.done && <span className="text-xs text-muted-foreground">skipped</span>}
            </Link>
          </li>
        ))}
      </ol>
      {data.nextStep && (
        <Button asChild className="self-start">
          <Link href={`/setup?step=${data.nextStep}`}>Continue setup</Link>
        </Button>
      )}
    </WidgetFrame>
  );
}
