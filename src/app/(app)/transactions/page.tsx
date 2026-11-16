import Link from "next/link";
import { PageHeader } from "@/components/empty-state";
import { FiltersBar, type UrlFilters } from "@/components/transactions/filters-bar";
import { TransactionList } from "@/components/transactions/transaction-list";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { getSettings } from "@/server/finance/settings";
import { countNeedsReview, listTransactions, type TransactionFilters } from "@/server/finance/transactions";
import { billBucketOptions, defaultBillBucketId } from "@/server/plan/plans-service";
import { listMatchOptions } from "@/server/recurring/matching-service";
import { listGoals } from "@/server/goals/goals-service";

export const metadata = { title: "Transactions · Finnance" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const isoDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const user = await requireUser();
  const sp = await searchParams;
  const urlFilters: UrlFilters = {
    q: one(sp.q),
    account: one(sp.account),
    category: one(sp.category),
    from: isoDate(one(sp.from)),
    to: isoDate(one(sp.to)),
    hidden: one(sp.hidden) === "1" ? "1" : undefined,
  };
  const filters: TransactionFilters = {
    search: urlFilters.q,
    accountId: urlFilters.account,
    categoryId: urlFilters.category,
    from: urlFilters.from,
    to: urlFilters.to,
    includeHidden: urlFilters.hidden === "1",
  };

  const db = getDb();
  const [page, accounts, categories, settings, reviewCount, matchOptions, bucketOptions, defaultBucketId, goalRows] = await Promise.all([
    listTransactions(db, user.id, filters),
    listAccounts(db, user.id),
    listCategories(db, user.id),
    getSettings(db, user.id),
    countNeedsReview(db, user.id),
    listMatchOptions(db, user.id),
    billBucketOptions(db, user.id),
    defaultBillBucketId(db, user.id),
    listGoals(db, user.id),
  ]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }));

  return (
    <div className="rise">
      <PageHeader title="Transactions" description="Everything in and out of your accounts." />
      {reviewCount > 0 && (
        <Link
          href="/transactions/review"
          className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
        >
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="flex-1">
            {reviewCount} {reviewCount === 1 ? "transaction needs" : "transactions need"} a look
          </span>
          <span className="font-medium text-primary">Review</span>
        </Link>
      )}
      <FiltersBar filters={urlFilters} accounts={accountOptions} categories={categoryOptions} />
      <TransactionList
        key={JSON.stringify(urlFilters)}
        initial={page.items}
        initialCursor={page.nextCursor}
        filters={filters}
        filtered={Object.values(urlFilters).some(Boolean)}
        accounts={accountOptions}
        categories={categoryOptions}
        timezone={settings.timezone}
        matchOptions={matchOptions}
        buckets={{ options: bucketOptions, defaultId: defaultBucketId }}
        goals={goalRows.filter((g) => g.status === "active" || g.status === "paused").map((g) => ({ id: g.id, name: g.name }))}
      />
    </div>
  );
}
