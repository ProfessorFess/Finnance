import { Landmark } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Accounts · Finnance" };

export default function AccountsPage() {
  return (
    <div className="rise">
      <PageHeader title="Accounts" description="Where your money lives." />
      <EmptyState
        icon={Landmark}
        phase="Phase 1"
        title="Your accounts and balances"
        description="Add your checking and savings accounts with their starting balances, and see each one stay current as you import."
      />
    </div>
  );
}
