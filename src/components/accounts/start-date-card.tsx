"use client";

import { CalendarDays } from "lucide-react";
import { useState, useTransition } from "react";
import { saveStartDate } from "@/app/(app)/accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDisplayDate } from "@/lib/dates";

export function StartDateCard({ startDate }: { startDate: string | null }) {
  const [editing, setEditing] = useState(startDate === null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing && startDate) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xs">
        <CalendarDays className="size-5 text-primary" />
        <p className="flex-1 text-sm">
          Tracking since <span className="font-medium">{formatDisplayDate(startDate)}</span>
        </p>
        <Button variant="link" onClick={() => setEditing(true)}>
          Change
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <h2 className="text-lg font-semibold">When does tracking start?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick the day you start fresh, usually your next payday. Anything earlier in your bank files is skipped.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        action={(formData) =>
          startTransition(async () => {
            const res = await saveStartDate(formData);
            if (res.ok) {
              setError(null);
              setEditing(false);
            } else setError(res.error);
          })
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startDate">Tracking start date</Label>
          <Input id="startDate" name="startDate" type="date" required defaultValue={startDate ?? ""} className="w-44" />
        </div>
        <Button type="submit" disabled={pending}>
          Save start date
        </Button>
        {startDate && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
