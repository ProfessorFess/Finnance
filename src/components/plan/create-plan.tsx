"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPlanAction } from "@/app/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { FundingType, LimitPeriod, PlanCadence, PlanTemplate } from "@/server/db/finance-schema";
import { type EngineBucket, fundIncome, incomesPerMonth, planTypicalIncome, suggestedFunding } from "@/server/plan/engine";
import type { BucketDraft } from "@/server/plan/templates";
import type { Frequency } from "@/server/recurring/schedule";
import { healthText } from "./health-chip";

/** planningCents: per occurrence (scheduled) or per month (irregular); null when paused or unknown. */
export type CreatePlanIncome = { id: string; name: string; frequency: Frequency; planningCents: number | null; events: { date: string; amountCents: number }[] };
export type CreatePlanTemplate = {
  key: PlanTemplate;
  name: string;
  description: string;
  cadence: PlanCadence | null;
  buckets: BucketDraft[];
  extraIncomeBucket: number | null;
};

type Row = { key: number; draft: BucketDraft; amount: string; percent: string; limit: string; amountTouched: boolean };

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm";
const toInput = (cents: number | null) => (cents ? (cents / 100).toFixed(2) : "");
const FUNDING_LABELS: Record<FundingType, string> = { fixed: "Fixed amount", percent: "Percent", sum_of_recurring: "Its bills", remainder: "What's left" };
const PERIOD_LABELS: Record<LimitPeriod, string> = { weekly: "per week", monthly: "per month", per_income: "since last income" };

let nextKey = 1;
const rowOf = (draft: BucketDraft): Row => ({
  key: nextKey++,
  draft,
  amount: toInput(draft.fundingCents),
  percent: draft.fundingBps ? String(draft.fundingBps / 100) : "",
  limit: toInput(draft.limitCents),
  amountTouched: draft.fundingCents !== null,
});

/** Choose a starting point, shape the buckets, and create the plan. */
export function CreatePlan({
  templates,
  incomes,
  accounts,
  billsMonthlyCents,
  today,
}: {
  templates: CreatePlanTemplate[];
  incomes: CreatePlanIncome[];
  accounts: { id: string; name: string }[];
  billsMonthlyCents: number;
  today: string;
}) {
  const [template, setTemplate] = useState<CreatePlanTemplate | null>(null);
  const [cadence, setCadence] = useState<PlanCadence>("per_income");
  const [incomeIds, setIncomeIds] = useState<Set<string>>(new Set(incomes.length === 1 ? [incomes[0]!.id] : []));
  const [rows, setRows] = useState<Row[]>([]);
  const [extra, setExtra] = useState<{ bucketKey: number; incomeSourceId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (t: CreatePlanTemplate) => {
    setTemplate(t);
    setCadence(t.cadence ?? "per_income");
    const next = t.buckets.map(rowOf);
    setRows(next);
    const scheduled = incomes.find((i) => incomeIds.has(i.id) && i.frequency !== "irregular") ?? incomes.find((i) => i.frequency !== "irregular");
    setExtra(t.extraIncomeBucket !== null && scheduled ? { bucketKey: next[t.extraIncomeBucket]!.key, incomeSourceId: scheduled.id } : null);
    setError(null);
  };

  const selected = incomes.filter((i) => incomeIds.has(i.id));
  const perMonth = cadence === "per_income" ? incomesPerMonth(selected.map((i) => ({ frequency: i.frequency, eventDates: i.events.map((e) => e.date) })), today) : 1;
  // The same math the Plan page uses, so the preview matches what you'll see after creating it.
  const typical = planTypicalIncome(cadence, selected, today);

  const drafts = rows.map((r) => toDraft(r));
  const firstBills = drafts.findIndex((d) => d.fundingType === "sum_of_recurring");
  const engine: EngineBucket[] = drafts.map((d, i) => ({ ...d, id: String(i), linkedRuleIds: [], linkedMonthlyCents: i === firstBills ? billsMonthlyCents : 0 }));
  const health = typical !== null && rows.length ? fundIncome(engine, typical, perMonth, null).health : null;

  const update = (key: number, change: Partial<Row>) =>
    setRows((list) =>
      list.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...change, draft: { ...r.draft, ...(change.draft ?? {}) } };
        // A limit suggests what the bucket should get, until the user sets that themselves.
        if (change.limit !== undefined && next.draft.fundingType === "fixed" && !next.amountTouched) {
          const cents = parseAmountToCents(next.limit);
          next.amount = cents && cents > 0 ? toInput(suggestedFunding(cents, next.draft.limitPeriod ?? defaultPeriod(cadence), perMonth, cadence)) : "";
        }
        return next;
      }),
    );

  const submit = () =>
    startTransition(async () => {
      if (!template) return;
      const extraIndex = extra ? rows.findIndex((r) => r.key === extra.bucketKey) : -1;
      const res = await createPlanAction({
        template: template.key,
        cadence,
        name: template.key === "custom" ? "My plan" : template.name,
        incomeSourceIds: [...incomeIds],
        buckets: drafts,
        extraIncome: cadence === "per_income" && extra && extraIndex >= 0 && incomeIds.has(extra.incomeSourceId) ? { bucketIndex: extraIndex, incomeSourceId: extra.incomeSourceId } : null,
      });
      if ("error" in res) setError(res.error);
      else toast.success("Your plan is set up");
    });

  const extraSource = extra ? incomes.find((i) => i.id === extra.incomeSourceId) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Choose a starting point</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={template?.key === t.key}
              onClick={() => choose(t)}
              className={cn(
                "rounded-2xl border bg-card px-4 py-4 text-left shadow-xs transition-colors hover:bg-muted/40",
                template?.key === t.key && "border-primary ring-2 ring-primary/30",
              )}
            >
              <span className="block font-medium">{t.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      {template && (
        <>
          {template.cadence === null && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">How should money be split?</h2>
              <div className="flex flex-col gap-2 text-sm">
                {(["per_income", "monthly"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input type="radio" name="cadence" checked={cadence === c} onChange={() => setCadence(c)} className="size-4 accent-primary" />
                    {c === "per_income" ? "Split each income as it arrives" : "Budget each month"}
                  </label>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Funded by</h2>
            <div className="flex flex-col gap-2 text-sm">
              {incomes.map((i) => (
                <label key={i.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={incomeIds.has(i.id)}
                    onChange={(e) =>
                      setIncomeIds((set) => {
                        const next = new Set(set);
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                        return next;
                      })
                    }
                    className="size-4 accent-primary"
                  />
                  {i.name}
                  <IncomeHint income={i} cadence={cadence} today={today} />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Your buckets</h2>
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <DraftRow
                  key={r.key}
                  row={r}
                  cadence={cadence}
                  accounts={accounts}
                  canRemove={rows.length > 1}
                  onChange={(change) => update(r.key, change)}
                  onRemove={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                />
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  rowOf({ name: "New bucket", role: "spending", icon: "wallet", fundingType: "fixed", fundingCents: null, fundingBps: null, limitCents: null, limitPeriod: null, trackCategoryIds: [], destinationAccountId: null }),
                ])
              }
            >
              <Plus /> Add bucket
            </Button>
          </section>

          {cadence === "per_income" && extra !== null && extraSource && (
            <section className="flex flex-col gap-1.5 text-sm">
              <Label htmlFor="extra-income">Extra paychecks from {extraSource.name} go to</Label>
              <select
                id="extra-income"
                value={String(extra.bucketKey)}
                onChange={(e) => setExtra(e.target.value ? { ...extra, bucketKey: Number(e.target.value) } : null)}
                className={selectClass}
              >
                {rows.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.draft.name}
                  </option>
                ))}
                <option value="">Nowhere special</option>
              </select>
            </section>
          )}

          <div className="flex flex-col gap-3 border-t pt-4">
            {health && typical !== null && (
              <p className="text-sm">
                <span className={cn("font-medium", health.kind === "over" && "text-destructive")}>{healthText(health)}</span>
                <span className="text-muted-foreground"> for a typical ≈ {formatCents(typical)} {cadence === "monthly" ? "month" : "income"}</span>
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="button" className="self-start" disabled={pending} onClick={submit}>
              Create plan
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function IncomeHint({ income, cadence, today }: { income: CreatePlanIncome; cadence: PlanCadence; today: string }) {
  const cents = planTypicalIncome(cadence, [income], today);
  if (cents === null) return null;
  return (
    <span className="num text-muted-foreground">
      ≈ {formatCents(cents)}
      {cadence === "monthly" ? "/mo" : " each"}
    </span>
  );
}

const defaultPeriod = (cadence: PlanCadence): LimitPeriod => (cadence === "monthly" ? "monthly" : "weekly");

function toDraft(r: Row): BucketDraft {
  const amount = parseAmountToCents(r.amount);
  const limit = parseAmountToCents(r.limit);
  const percent = Number(r.percent);
  const hasLimit = limit !== null && limit > 0;
  return {
    ...r.draft,
    fundingCents: r.draft.fundingType === "fixed" ? (amount !== null ? Math.abs(amount) : null) : null,
    fundingBps: r.draft.fundingType === "percent" && Number.isFinite(percent) && r.percent.trim() ? Math.round(percent * 100) : null,
    limitCents: hasLimit ? limit : null,
    limitPeriod: hasLimit ? (r.draft.limitPeriod ?? "weekly") : null,
  };
}

function DraftRow({
  row,
  cadence,
  accounts,
  canRemove,
  onChange,
  onRemove,
}: {
  row: Row;
  cadence: PlanCadence;
  accounts: { id: string; name: string }[];
  canRemove: boolean;
  onChange: (change: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const name = row.draft.name || "Bucket";
  const period = row.draft.limitPeriod ?? defaultPeriod(cadence);
  return (
    <li className="rounded-2xl border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <Input aria-label={`${name} name`} value={row.draft.name} maxLength={80} onChange={(e) => onChange({ draft: { ...row.draft, name: e.target.value } })} className="font-medium" />
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={onRemove}>
            <X />
          </Button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Gets</span>
          <select
            aria-label={`${name} gets`}
            value={row.draft.fundingType}
            onChange={(e) => onChange({ draft: { ...row.draft, fundingType: e.target.value as FundingType } })}
            className={selectClass}
          >
            {(Object.keys(FUNDING_LABELS) as FundingType[]).map((f) => (
              <option key={f} value={f}>
                {FUNDING_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        {row.draft.fundingType === "fixed" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{cadence === "monthly" ? "Each month" : "From each income"}</span>
            <Input aria-label={`${name} amount`} inputMode="decimal" value={row.amount} placeholder="0.00" className="num" onChange={(e) => onChange({ amount: e.target.value, amountTouched: e.target.value !== "" })} />
          </div>
        )}
        {row.draft.fundingType === "percent" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Percent</span>
            <Input aria-label={`${name} percent`} inputMode="decimal" value={row.percent} placeholder="10" className="num" onChange={(e) => onChange({ percent: e.target.value })} />
          </div>
        )}
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-xs text-muted-foreground">Limit (optional)</span>
          <div className="flex min-w-0 gap-1">
            <Input aria-label={`${name} limit`} inputMode="decimal" value={row.limit} placeholder="None" className="num min-w-0 flex-1" onChange={(e) => onChange({ limit: e.target.value, draft: { ...row.draft, limitPeriod: period } })} />
            <select aria-label={`${name} limit period`} value={period} onChange={(e) => onChange({ draft: { ...row.draft, limitPeriod: e.target.value as LimitPeriod } })} className={cn(selectClass, "w-auto shrink-0")}>
              {(Object.keys(PERIOD_LABELS) as LimitPeriod[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Move to</span>
          <select
            aria-label={`${name} move to`}
            value={row.draft.destinationAccountId ?? ""}
            onChange={(e) => onChange({ draft: { ...row.draft, destinationAccountId: e.target.value || null } })}
            className={selectClass}
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
}
