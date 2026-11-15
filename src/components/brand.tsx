import { cn } from "@/lib/utils";

/** The Finnance mark: an "F" whose arms are rising bars. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M10 8h3v16h-3z" className="fill-primary-foreground" />
      <path d="M14 8h9v3h-9zM14 14.5h6v3h-6z" className="fill-primary-foreground" opacity="0.85" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Mark />
      <span className="font-heading text-[1.35rem] leading-none font-semibold tracking-tight">Finnance</span>
    </span>
  );
}
