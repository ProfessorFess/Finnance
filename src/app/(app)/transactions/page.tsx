import { ListOrdered } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Transactions · Finnance" };

export default function TransactionsPage() {
  return (
    <div className="rise">
      <PageHeader title="Transactions" description="Everything in and out of your accounts." />
      <EmptyState
        icon={ListOrdered}
        phase="Phase 1"
        title="Every transaction, sorted for you"
        description="Upload your bank statements and Finnance categorizes them, learns from your corrections, and keeps transfers between your own accounts out of your totals."
      />
    </div>
  );
}
