import { CalendarClock } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Recurring · Finnance" };

export default function RecurringPage() {
  return (
    <div className="rise">
      <PageHeader title="Recurring" description="Paychecks, bills, and subscriptions." />
      <EmptyState
        icon={CalendarClock}
        phase="Phase 1c"
        title="Income and bills, entered once"
        description="Add your paycheck, bills, and subscriptions once. Finnance expects them, matches them when they arrive, and flags anything late."
      />
    </div>
  );
}
