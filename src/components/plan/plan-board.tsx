"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { LogIncomeDialog } from "@/components/recurring/log-income-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PlanStatus } from "@/server/plan/status-service";
import type { BucketDraft } from "@/server/plan/templates";
import { BucketCard } from "./bucket-card";
import { BucketDialog, type DialogCategory } from "./bucket-dialog";
import { HealthChip } from "./health-chip";
import { IncomeCard } from "./income-card";
import { PlanSettings, type SettingsIncome } from "./plan-settings";

export type BoardIncome = { id: string; name: string; accountId: string | null };

export function PlanBoard({
  status,
  incomes,
  allIncomes,
  accounts,
  categories,
  extraRule,
}: {
  status: PlanStatus;
  incomes: BoardIncome[];
  allIncomes: SettingsIncome[];
  accounts: { id: string; name: string }[];
  categories: DialogCategory[];
  extraRule: { bucketId: string; incomeSourceId: string | null } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; bucket: { id: string; draft: BucketDraft } | null }>({ open: false, bucket: null });
  const [logging, setLogging] = useState(false);
  const [sourceId, setSourceId] = useState(incomes[0]?.id ?? "");
  const source = incomes.find((i) => i.id === sourceId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mt-4 flex justify-end">
        <Button type="button" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}>
          <Pencil /> {editing ? "Done" : "Edit plan"}
        </Button>
      </div>
      <IncomeCard status={status} onLog={() => setLogging(true)} />
      <HealthChip health={status.health} typicalCents={status.typicalIncomeCents} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {status.buckets.map((b) => (
          <BucketCard key={b.id} bucket={b} cadence={status.plan.cadence}>
            {editing && (
              <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${b.name}`} onClick={() => setDialog({ open: true, bucket: { id: b.id, draft: b.draft } })}>
                Edit
              </Button>
            )}
          </BucketCard>
        ))}
      </ul>
      {editing && (
        <>
          <Button type="button" variant="outline" className="self-start" onClick={() => setDialog({ open: true, bucket: null })}>
            <Plus /> Add bucket
          </Button>
          <PlanSettings
            plan={{ id: status.plan.id, name: status.plan.name, cadence: status.plan.cadence }}
            incomes={allIncomes}
            planIncomeIds={status.incomes.map((i) => i.id)}
            buckets={status.buckets.map((b) => ({ id: b.id, name: b.name }))}
            extraRule={extraRule}
          />
        </>
      )}
      {incomes.length > 1 && logging && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="log-source">Log income for</Label>
          <select id="log-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
            {incomes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <LogIncomeDialog open={logging} onOpenChange={setLogging} source={source} accounts={accounts} today={status.today} />
      <BucketDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        planId={status.plan.id}
        cadence={status.plan.cadence}
        bucket={dialog.bucket}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
