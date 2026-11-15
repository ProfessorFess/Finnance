import { House } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Home · Finnance" };

export default function HomePage() {
  return (
    <div className="rise">
      <PageHeader title="Home" description="Here's where your money stands." />
      <EmptyState
        icon={House}
        phase="Phase 2a"
        title="Your dashboard"
        description="Weekly spending left, paycheck tasks, your plan, and goals, all kept up to date from your bank files. No typing it in by hand."
      />
    </div>
  );
}
