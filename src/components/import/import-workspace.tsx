"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { importFile, previewFile } from "@/app/(app)/import/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ColumnMapping } from "@/server/import/types";
import { type FileEntry, FileCard } from "./file-card";

const ACCEPT = ".csv,.xlsx,.ofx,.qfx";

function formFor(entry: FileEntry, mapping?: ColumnMapping) {
  const fd = new FormData();
  fd.set("file", entry.file);
  if (mapping) fd.set("mapping", JSON.stringify(mapping));
  return fd;
}

/** Choose files, preview each, pick accounts, import them all, see results. */
export function ImportWorkspace({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<FileEntry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  async function preview(entry: FileEntry, mapping?: ColumnMapping) {
    update(entry.key, { status: "previewing", error: undefined, mapping });
    const res = await previewFile(formFor(entry, mapping));
    if ("error" in res) return update(entry.key, { status: "error", error: res.error });
    setEntries((list) =>
      list.map((e) =>
        e.key === entry.key
          ? { ...e, status: "ready", preview: res, accountId: e.accountId || res.suggestedAccountId || "" }
          : e,
      ),
    );
  }

  function addFiles(files: FileList | File[]) {
    const added = Array.from(files).map<FileEntry>((file) => ({
      key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      status: "previewing",
      accountId: "",
    }));
    setEntries((list) => [...list.filter((e) => e.status !== "done"), ...added]);
    added.forEach((e) => void preview(e));
  }

  async function runImport() {
    setRunning(true);
    for (const entry of entries.filter((e) => e.status === "ready")) {
      update(entry.key, { status: "importing" });
      const fd = formFor(entry, entry.mapping);
      fd.set("accountId", entry.accountId);
      const res = await importFile(fd);
      if ("error" in res) update(entry.key, { status: "ready", error: res.error });
      else update(entry.key, { status: "done", result: res, error: undefined });
    }
    setRunning(false);
  }

  const pending = entries.filter((e) => e.status !== "done" && e.status !== "error");
  const finished = entries.length > 0 && entries.every((e) => e.status === "done" || e.status === "error");
  const canImport =
    pending.length > 0 &&
    pending.every((e) => e.status === "ready" && e.accountId && e.preview && (!e.preview.needsMapping || e.mapping));

  return (
    <section className="flex flex-col gap-4">
      {!finished && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card/60 px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "hover:border-primary/40",
          )}
        >
          <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Upload className="size-5" />
          </div>
          <span className="font-medium">Choose files</span>
          <span className="text-sm text-muted-foreground">
            Or drop them here. CSV, Excel, or OFX from any of your accounts, several at once.
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {entries.map((entry) => (
        <FileCard
          key={entry.key}
          entry={entry}
          accounts={accounts}
          onAccount={(accountId) => update(entry.key, { accountId })}
          onMapping={(mapping) => void preview(entry, mapping)}
          onRemove={() => setEntries((list) => list.filter((e) => e.key !== entry.key))}
        />
      ))}

      {pending.length > 0 && (
        <div className="flex justify-end">
          <Button size="lg" disabled={!canImport || running} onClick={runImport}>
            {running ? "Importing…" : `Import ${pending.length} ${pending.length === 1 ? "file" : "files"}`}
          </Button>
        </div>
      )}

      {finished && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setEntries([])}>
            Import more
          </Button>
          <Button asChild>
            <Link href="/transactions">View transactions</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
