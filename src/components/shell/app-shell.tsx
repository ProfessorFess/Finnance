import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { AssistantProvider } from "./assistant-sheet";
import { BottomTabs } from "./bottom-tabs";
import { Sidebar } from "./sidebar";

export function AppShell({ user, children }: { user: { email: string }; children: ReactNode }) {
  return (
    <AssistantProvider>
      <div className="relative z-10 flex min-h-dvh">
        <Sidebar email={user.email} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center px-4 md:hidden">
            <Link href="/" aria-label="Finnance home">
              <Wordmark />
            </Link>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 md:px-10 md:pt-12 md:pb-16">
            {children}
          </main>
        </div>
      </div>
      <BottomTabs />
    </AssistantProvider>
  );
}
