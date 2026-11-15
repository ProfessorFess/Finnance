"use client";

import { CircleAlert, CircleCheck, FileText, LoaderCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ImportPreview, ImportResult } from "@/server/import/service";
import type { ColumnMapping } from "@/server/import/types";
import { blankMapping, MappingEditor } from "./mapping-editor";

export type FileEntry = {
  key: string;
  file: File;
  status: "previewing" | "ready" | "importing" | "done" | "error";
  preview?: ImportPreview;
  result?: ImportResult;
  error?: string;
  accountId: string;
  mapping?: ColumnMapping;
};

export function countLine(p: ImportPreview): string {
  const parts = [`${p.counts.ready} to import`];
  if (p.counts.pending) parts.push(`${p.counts.pending} pending skipped`);
  if (p.counts.beforeStart) parts.push(`${p.counts.beforeStart} before your start date`);
  if (p.counts.errors) parts.push(`${p.counts.errors} ${p.counts.errors === 1 ? "row" : "rows"} couldn't be read`);
  return parts.join(" · ");
}

export function resultLine(r: ImportResult): string {
  return r.duplicates > 0 ? `${r.imported} imported · ${r.duplicates} already here` : `${r.imported} imported`;
}

export function FileCard({
  entry,
  accounts,
  onAccount,
  onMapping,
  onRemove,
}: {
  entry: FileEntry;
  accounts: { id: string; name: string }[];
  onAccount: (accountId: string) => void;
  onMapping: (mapping: ColumnMapping) => void;
  onRemove: () => void;
}) {
  const p = entry.preview;
  const locked = entry.status === "importing" || entry.status === "done";
  const selectId = `account-${entry.key}`;

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <header className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{entry.file.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {p && <Badge variant="secondary">{p.formatLabel}</Badge>}
            {entry.status === "previewing" && (
              <span className="flex items-center gap-1">
                <LoaderCircle className="size-3.5 animate-spin" /> Reading…
              </span>
            )}
            {p && entry.status !== "done" && !p.needsMapping && <span>{countLine(p)}</span>}
          </div>
        </div>
        {!locked && (
          <Button variant="ghost" size="icon" aria-label={`Remove ${entry.file.name}`} onClick={onRemove}>
            <X />
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {entry.error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4" /> {entry.error}
          </p>
        )}

        {entry.status === "done" && entry.result && (
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-4 text-positive" /> {resultLine(entry.result)}
          </p>
        )}

        {p && entry.status !== "done" && (
          <>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
                Account
              </label>
              <select
                id={selectId}
                value={entry.accountId}
                disabled={locked}
                onChange={(e) => onAccount(e.target.value)}
                className={cn(
                  "h-9 rounded-lg border border-input bg-background px-2 text-sm",
                  !entry.accountId && "border-destructive/60",
                )}
              >
                <option value="">Choose an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {(p.needsMapping || entry.mapping) && (
              <MappingEditor
                idPrefix={entry.key}
                headers={p.headers}
                mapping={entry.mapping ?? p.mapping ?? blankMapping(p.headers)}
                onChange={onMapping}
              />
            )}

            {p.sample.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.sample.map((r) => (
                      <tr key={`${r.line}`} className="border-t">
                        <td className="num px-3 py-2 whitespace-nowrap">{formatDisplayDate(r.date)}</td>
                        <td className="max-w-[16rem] truncate px-3 py-2">{r.description}</td>
                        <td className={cn("num px-3 py-2 text-right whitespace-nowrap", r.amountCents > 0 && "text-positive")}>
                          {formatCents(r.amountCents, { sign: "always" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {p.errors.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {p.counts.errors} {p.counts.errors === 1 ? "row" : "rows"} couldn&apos;t be read
                </summary>
                <ul className="mt-2 flex flex-col gap-1 pl-4 text-xs text-muted-foreground">
                  {p.errors.map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </article>
  );
}
