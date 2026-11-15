"use client";

import { Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const AssistantContext = createContext<{ open: () => void } | null>(null);

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

/** Holds the assistant panel and opens it from any trigger or with ⌘K / Ctrl+K. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AssistantContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="w-full data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-heading text-xl">
              <Sparkles className="size-5 text-primary" /> Assistant
            </SheetTitle>
            <SheetDescription>Ask about your money, or ask it to make changes for you.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </div>
            <p className="font-heading text-lg">The assistant arrives in Phase 2b.</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              You&apos;ll be able to ask things like &ldquo;how much did I spend on food in October?&rdquo; or
              &ldquo;move $50 into my goal fund&rdquo;, and approve every change it makes.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </AssistantContext.Provider>
  );
}
