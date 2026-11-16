"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-sheet";
import { isActive, navItems, setupNavItem } from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

export function Sidebar({ email, showSetup = false }: { email: string; showSetup?: boolean }) {
  const pathname = usePathname();
  const assistant = useAssistant();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-surface/70 px-3 py-5 backdrop-blur md:flex">
      <Link href="/" className="mb-7 px-3" aria-label="Finnance home">
        <Wordmark />
      </Link>

      <button
        type="button"
        onClick={assistant.open}
        aria-label="Assistant"
        className="group mb-6 flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Sparkles className="size-4 text-primary" />
        <span className="flex-1">Ask the assistant</span>
        <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[0.7rem]">⌘K</kbd>
      </button>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {(showSetup ? [...navItems, setupNavItem] : navItems).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.92rem] transition-colors",
                active
                  ? "bg-card font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
              <Icon className={cn("size-[1.05rem]", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </span>
          <ThemeToggle />
        </div>
        <SignOutButton className="mt-1 w-full" />
      </div>
    </aside>
  );
}
