import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/empty-state";
import { ReviewDeck } from "@/components/review/review-deck";
import { requireUser } from "@/server/auth/session";
import { countUnsorted } from "@/server/categorize/pipeline";
import { getDb } from "@/server/db/client";
import { listCategories } from "@/server/finance/categories";
import { listTransactions } from "@/server/finance/transactions";

export const metadata = { title: "Review · Finnance" };

/** Categories people reach for most, as quick picks when Finnance has no guess. */
const POPULAR = ["Restaurants", "Groceries", "Coffee", "Shopping", "Gas & fuel", "Subscriptions", "Paycheck"];

export default async function ReviewPage() {
  const user = await requireUser();
  const db = getDb();
  const [{ items }, categories, unsorted] = await Promise.all([
    listTransactions(db, user.id, { needsReview: true, limit: 50 }),
    listCategories(db, user.id),
    countUnsorted(db, user.id),
  ]);
  const options = categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }));
  const popular = POPULAR.map((n) => categories.find((c) => c.name === n)?.id).filter((id): id is string => Boolean(id));

  return (
    <div className="rise mx-auto max-w-xl">
      <Link href="/transactions" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Transactions
      </Link>
      <PageHeader title="Review" description="Help Finnance sort what it wasn't sure about." />
      <ReviewDeck rows={items} categories={options} popular={popular} unsorted={unsorted} />
    </div>
  );
}
