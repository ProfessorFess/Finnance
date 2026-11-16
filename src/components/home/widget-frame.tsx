import Link from "next/link";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/server/db/finance-schema";

/** Column span on the 12-column desktop grid; one column on phones. */
const SPAN: Record<WidgetSize, string> = { sm: "lg:col-span-4", md: "lg:col-span-6", lg: "lg:col-span-8", full: "lg:col-span-12" };

export function WidgetFrame({
  title,
  size,
  href,
  children,
}: {
  title: string;
  size: WidgetSize;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs", SPAN[size])}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-primary hover:underline">
            See all →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** An empty widget says what to do next. */
export function WidgetEmpty({ text, href, action }: { text: string; href?: string; action?: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {text}
      {href && action && (
        <>
          {" "}
          <Link href={href} className="text-primary underline">
            {action}
          </Link>
        </>
      )}
    </p>
  );
}

/** A thin progress bar (share 0–1). */
export function Bar({ share, danger }: { share: number; danger?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn("h-full rounded-full", danger ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
    </div>
  );
}
