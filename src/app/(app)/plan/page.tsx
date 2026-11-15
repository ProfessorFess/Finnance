import { PieChart } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Plan · Finnance" };

export default function PlanPage() {
  return (
    <div className="rise">
      <PageHeader title="Plan" description="How each paycheck gets put to work." />
      <EmptyState
        icon={PieChart}
        phase="Phase 2a"
        title="Your paycheck plan"
        description="Split each paycheck into savings, bills, weekly spending, and a buffer, and see what's left in each, updated automatically."
      />
    </div>
  );
}
