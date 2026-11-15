"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { undoBatch } from "@/app/(app)/import/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type RecentImport = {
  id: string;
  fileName: string;
  accountName: string;
  importedCount: number;
  createdAt: string;
  undone: boolean;
};

export function RecentImports({ batches }: { batches: RecentImport[] }) {
  const [confirm, setConfirm] = useState<RecentImport | null>(null);
  const [pending, startTransition] = useTransition();
  if (batches.length === 0) return null;

  return (
    <section aria-label="Recent imports" className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
      <ul className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {batches.map((b) => (
          <li key={b.id} className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.fileName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {b.accountName} · {new Date(b.createdAt).toLocaleString()} · {b.importedCount} imported
              </p>
            </div>
            {b.undone ? (
              <span className="text-xs text-muted-foreground">Undone</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirm(b)}>
                Undo
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {confirm?.importedCount} transactions {confirm?.fileName} added to {confirm?.accountName},
              including any categories or notes you set on them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                const batch = confirm;
                if (!batch) return;
                startTransition(async () => {
                  const res = await undoBatch(batch.id);
                  if ("error" in res) toast.error(res.error);
                  else toast.success(`Removed ${res.removed} transactions`);
                  setConfirm(null);
                });
              }}
            >
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
