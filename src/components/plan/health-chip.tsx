import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import type { Health } from "@/server/plan/engine";

export function healthText(h: Health): string {
  if (h.kind === "fully_allocated") return "Fully allocated";
  if (h.kind === "unassigned") return `${formatCents(h.cents)} unassigned`;
  return `Over by ${formatCents(h.cents)}`;
}

export function HealthChip({ health, typicalCents }: { health: Health | null; typicalCents: number | null }) {
  if (!health) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={health.kind === "over" ? "destructive" : "secondary"}>{healthText(health)}</Badge>
      {typicalCents !== null && <span className="text-muted-foreground">for a typical ≈ {formatCents(typicalCents)} income</span>}
    </div>
  );
}
