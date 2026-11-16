"use client";

import { Ellipsis, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAssistant } from "./assistant-sheet";
import { isActive, navItems, setupNavItem } from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

const tabs = navItems.filter((i) => i.mobileTab);
const moreItems = navItems.filter((i) => !i.mobileTab);

function TabLink({ href, label, icon: Icon, active }: (typeof navItems)[number] & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[0.68rem] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

export function BottomTabs({ showSetup = false }: { showSetup?: boolean }) {
  const more = showSetup ? [...moreItems, setupNavItem] : moreItems;
  const pathname = usePathname();
  const assistant = useAssistant();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav
        aria-label="Tabs"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 backdrop-blur-lg md:hidden"
      >
        <div className="mx-auto flex max-w-lg items-end">
          <TabLink {...tabs[0]!} active={isActive(pathname, tabs[0]!.href)} />
          <TabLink {...tabs[1]!} active={isActive(pathname, tabs[1]!.href)} />
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={assistant.open}
              aria-label="Assistant"
              className="-mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
            >
              <Sparkles className="size-6" />
            </button>
          </div>
          <TabLink {...tabs[2]!} active={isActive(pathname, tabs[2]!.href)} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="More"
            className={cn(
              "flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[0.68rem] font-medium",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Ellipsis className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-safe rounded-t-2xl">
          <SheetHeader className="pb-0">
            <SheetTitle className="font-heading text-lg">More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2 px-4">
            {more.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex items-center gap-3 rounded-xl border bg-background px-3 py-3 text-sm aria-[current=page]:border-primary/40 aria-[current=page]:text-primary"
              >
                <Icon className="size-[1.1rem]" />
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-4 pt-3 pb-4">
            <SignOutButton />
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              Theme <ThemeToggle />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
