import { ArrowDownToLine } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/empty-state";
import { ImportWorkspace } from "@/components/import/import-workspace";
import { RecentImports } from "@/components/import/recent-imports";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { getSettings } from "@/server/finance/settings";
import { listImportBatches } from "@/server/import/service";

export const metadata = { title: "Import · Finnance" };

export default async function ImportPage() {
  const user = await requireUser();
  const db = getDb();
  const [settings, accounts, batches] = await Promise.all([
    getSettings(db, user.id),
    listAccounts(db, user.id),
    listImportBatches(db, user.id),
  ]);

  const blocker = !settings.trackingStartDate
    ? {
        title: "Set your tracking start date first",
        description: "Finnance only imports transactions from that day on, so it needs to know where to start.",
      }
    : accounts.length === 0
      ? { title: "Add your accounts first", description: "Each file goes into one of your accounts, so add them before importing." }
      : null;

  return (
    <div className="rise">
      <PageHeader title="Import" description="Bring in your latest bank statements." />
      {blocker ? (
        <EmptyState
          icon={ArrowDownToLine}
          title={blocker.title}
          description={blocker.description}
          action={
            <Button asChild>
              <Link href="/accounts">Go to Accounts</Link>
            </Button>
          }
        />
      ) : (
        <ImportWorkspace accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      )}
      <RecentImports
        batches={batches.map((b) => ({
          id: b.id,
          fileName: b.fileName,
          accountName: b.accountName,
          importedCount: b.importedCount,
          createdAt: b.createdAt.toISOString(),
          undone: b.undoneAt !== null,
        }))}
      />
    </div>
  );
}
