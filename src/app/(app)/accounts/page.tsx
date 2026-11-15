import { AccountList } from "@/components/accounts/account-list";
import { StartDateCard } from "@/components/accounts/start-date-card";
import { PageHeader } from "@/components/empty-state";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { getSettings } from "@/server/finance/settings";

export const metadata = { title: "Accounts · Finnance" };

export default async function AccountsPage() {
  const user = await requireUser();
  const db = getDb();
  const [settings, accounts] = await Promise.all([getSettings(db, user.id), listAccounts(db, user.id)]);

  return (
    <div className="rise">
      <PageHeader title="Accounts" description="Where your money lives." />
      <StartDateCard key={settings.trackingStartDate ?? "unset"} startDate={settings.trackingStartDate} />
      <AccountList
        startDate={settings.trackingStartDate}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          institution: a.institution,
          lastFour: a.lastFour,
          startingBalanceCents: a.startingBalanceCents,
          balanceCents: a.balanceCents,
          lastImportAt: a.lastImportAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
