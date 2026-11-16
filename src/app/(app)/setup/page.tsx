import { CheckCircle2, Circle, MinusCircle, PartyPopper } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/empty-state";
import { AccountsStep, BillsStep, GoalsStep, IncomeStep, PlanStep, StartDateStep, StepActions } from "@/components/setup/setup-flow";
import { Button } from "@/components/ui/button";
import { todayInTimeZone } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { getSettings } from "@/server/finance/settings";
import { listGoals } from "@/server/goals/goals-service";
import { getSetupStatus, SETUP_STEPS, type SetupStepKey } from "@/server/home/setup-service";
import { billBucketOptions, defaultBillBucketId, getActivePlan } from "@/server/plan/plans-service";
import { recentIncomeEvents } from "@/server/plan/status-service";
import { PLAN_TEMPLATES, templateDrafts } from "@/server/plan/templates";
import { listIncomeSources, listRecurringRules } from "@/server/recurring/items-service";
import { getRecurringOverview } from "@/server/recurring/overview";

export const metadata = { title: "Setup · Finnance" };

const KEYS = SETUP_STEPS.map((s) => s.key);
const isStep = (s: unknown): s is SetupStepKey => typeof s === "string" && (KEYS as string[]).includes(s);

async function StepBody({ db, userId, step }: { db: Database; userId: string; step: SetupStepKey }) {
  const settings = await getSettings(db, userId);
  const today = todayInTimeZone(settings.timezone);
  const [accounts, categories] = await Promise.all([listAccounts(db, userId), listCategories(db, userId)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const dialogCategories = categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }));

  switch (step) {
    case "start_date":
      return <StartDateStep startDate={settings.trackingStartDate} />;
    case "accounts":
      return <AccountsStep accounts={accounts} startDate={settings.trackingStartDate} />;
    case "income": {
      const incomes = await listIncomeSources(db, userId);
      return (
        <IncomeStep
          incomes={incomes.map((i) => ({ id: i.id, name: i.name, detail: i.expectedCents ? `≈ ${formatCents(i.expectedCents)}` : "amount varies" }))}
          accounts={accountOptions}
          categories={dialogCategories}
        />
      );
    }
    case "plan": {
      const active = await getActivePlan(db, userId);
      if (active) return <PlanStep planName={active.plan.name} templates={[]} incomes={[]} accounts={[]} billsMonthlyCents={0} today={today} />;
      const [overview, history] = await Promise.all([getRecurringOverview(db, userId), recentIncomeEvents(db, userId)]);
      const templates = PLAN_TEMPLATES.map((t) => {
        const d = templateDrafts(t.key, categories);
        return { key: t.key, name: t.name, description: t.description, cadence: t.cadence, buckets: d.buckets, extraIncomeBucket: d.extraIncomeBucket };
      });
      return (
        <PlanStep
          planName={null}
          templates={templates}
          incomes={overview.income.map((v) => ({
            id: v.item.id,
            name: v.name,
            frequency: v.frequency,
            planningCents: v.item.active ? v.amountCents : null,
            events: history.get(v.item.id) ?? [],
          }))}
          accounts={accountOptions}
          billsMonthlyCents={overview.monthlyBillsCents}
          today={overview.today}
        />
      );
    }
    case "bills": {
      const [rules, options, defaultId] = await Promise.all([listRecurringRules(db, userId), billBucketOptions(db, userId), defaultBillBucketId(db, userId)]);
      return (
        <BillsStep
          bills={rules.map((r) => ({ id: r.id, name: r.name, detail: formatCents(r.expectedCents) }))}
          accounts={accountOptions}
          categories={dialogCategories}
          buckets={{ options, defaultId }}
        />
      );
    }
    case "goals": {
      const [goals, active] = await Promise.all([listGoals(db, userId), getActivePlan(db, userId)]);
      return (
        <GoalsStep
          goals={goals.filter((g) => g.status !== "archived").map((g) => ({ id: g.id, name: g.name, detail: g.targetCents ? formatCents(g.targetCents) : undefined }))}
          defaultStartDate={settings.trackingStartDate ?? today}
          accounts={accountOptions}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          buckets={(active?.buckets ?? []).map((b) => ({ id: b.id, name: b.name, destinationAccountId: b.destinationAccountId }))}
        />
      );
    }
  }
}

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const user = await requireUser();
  const db = getDb();
  const { step: requested } = await searchParams;
  const status = await getSetupStatus(db, user.id);
  // Pin the URL to a step, so saving within a step doesn't jump ahead on refresh.
  if (!isStep(requested) && requested !== "done") redirect(status.nextStep ? `/setup?step=${status.nextStep}` : "/setup?step=done");
  const step: SetupStepKey | null = isStep(requested) ? requested : null;
  const index = step ? KEYS.indexOf(step) : -1;
  const current = step ? status.steps[index]! : null;
  const nextHref = index >= 0 && index < KEYS.length - 1 ? `/setup?step=${KEYS[index + 1]}` : "/setup?step=done";

  return (
    <div className="rise">
      <PageHeader title="Set up Finnance" description="A few short steps. Skip anything and come back to it later." />
      <ol aria-label="Setup steps" className="mb-6 flex flex-wrap gap-2">
        {status.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-current={s.key === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                s.key === step ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.done ? <CheckCircle2 className="size-3.5 text-primary" /> : s.skipped ? <MinusCircle className="size-3.5" /> : <Circle className="size-3.5" />}
              <span className="num">{i + 1}.</span> {s.title}
            </Link>
          </li>
        ))}
      </ol>

      {current ? (
        <section aria-label={current.title} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Step {index + 1} of {KEYS.length}
            </p>
            <h2 className="text-xl font-semibold">{current.title}</h2>
          </div>
          <StepBody db={db} userId={user.id} step={current.key} />
          <StepActions step={current.key} done={current.done} nextHref={nextHref} />
        </section>
      ) : (
        <section className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 shadow-xs">
          <PartyPopper className="size-8 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">You&apos;re all set</h2>
            <p className="mt-1 text-muted-foreground">
              {status.complete
                ? "Import your bank files after each payday and Home keeps itself up to date."
                : "Some steps are still open. Pick one above whenever you're ready."}
            </p>
          </div>
          <Button asChild>
            <Link href="/">Go to Home</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
