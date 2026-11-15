import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A friendly placeholder that always says what comes next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  phase,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card px-6 py-12 text-center shadow-xs sm:px-12 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.06] to-transparent"
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="grid size-12 place-items-center rounded-xl border bg-background text-primary shadow-xs">
          <Icon className="size-5" />
        </div>
        {phase && (
          <span className="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            Coming in {phase}
          </span>
        )}
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
    </header>
  );
}
