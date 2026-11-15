import { Goal } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Goals · Finnance" };

export default function GoalsPage() {
  return (
    <div className="rise">
      <PageHeader title="Goals" description="What you're saving toward." />
      <EmptyState
        icon={Goal}
        phase="Phase 2a"
        title="Goals that track themselves"
        description="Set a target, and Finnance projects when you'll reach it from what you actually save, not what you hoped to."
      />
    </div>
  );
}
