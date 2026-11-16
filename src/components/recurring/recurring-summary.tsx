import { formatCents } from "@/lib/money";

export function RecurringSummary({ monthlyIncomeCents, monthlyBillsCents }: { monthlyIncomeCents: number; monthlyBillsCents: number }) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-3">
      <div className="rounded-2xl border bg-card px-4 py-3 shadow-xs sm:px-5">
        <p className="text-xs text-muted-foreground">Income</p>
        <p className="num mt-1 text-lg font-semibold whitespace-nowrap text-primary sm:text-2xl">
          ≈ {formatCents(monthlyIncomeCents)}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </div>
      <div className="rounded-2xl border bg-card px-4 py-3 shadow-xs sm:px-5">
        <p className="text-xs text-muted-foreground">Bills &amp; subscriptions</p>
        <p className="num mt-1 text-lg font-semibold whitespace-nowrap sm:text-2xl">
          ≈ {formatCents(monthlyBillsCents)}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </div>
    </div>
  );
}
