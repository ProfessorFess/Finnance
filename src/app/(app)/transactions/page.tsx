import { PageHeader } from "@/components/empty-state";
import { FiltersBar, type UrlFilters } from "@/components/transactions/filters-bar";
import { TransactionList } from "@/components/transactions/transaction-list";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAccounts } from "@/server/finance/accounts";
import { listCategories } from "@/server/finance/categories";
import { getSettings } from "@/server/finance/settings";
import { listTransactions, type TransactionFilters } from "@/server/finance/transactions";

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
  };
  const filters: TransactionFilters = {
    search: urlFilters.q,
    accountId: urlFilters.account,
    categoryId: urlFilters.category,
    from: urlFilters.from,
    to: urlFilters.to,
  };

  const db = getDb();
  const [page, accounts, categories, settings] = await Promise.all([
    listTransactions(db, user.id, filters),
    listAccounts(db, user.id),
    listCategories(db, user.id),
    getSettings(db, user.id),
  ]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }));

  return (
    <div className="rise">
      <PageHeader title="Transactions" description="Everything in and out of your accounts." />
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
      />
    </div>
  );
}
