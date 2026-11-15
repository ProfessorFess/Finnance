import { ArrowDownToLine } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/empty-state";

export const metadata = { title: "Import · Finnance" };

export default function ImportPage() {
  return (
    <div className="rise">
      <PageHeader title="Import" description="Bring in your latest statements." />
      <EmptyState
        icon={ArrowDownToLine}
        phase="Phase 1"
        title="Drop in your bank files"
        description="Upload CSV, Excel, or OFX exports from all your accounts at once. Finnance remembers each bank's format and skips duplicates."
      />
    </div>
  );
}
