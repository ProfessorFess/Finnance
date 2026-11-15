import { ChevronRight, type LucideIcon, ShieldCheck, SlidersHorizontal, Sparkles, Tags } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/empty-state";

export const metadata = { title: "Settings · Finnance" };

const sections: { href: string; icon: LucideIcon; label: string; description: string }[] = [
  { href: "/settings/security", icon: ShieldCheck, label: "Security", description: "Two-factor authentication and backup codes" },
  { href: "/settings/rules", icon: Tags, label: "Categories & rules", description: "How Finnance sorts your transactions" },
];

const later = [
  { icon: SlidersHorizontal, label: "Preferences" },
  { icon: Sparkles, label: "Assistant" },
];

export default function SettingsPage() {
  return (
    <div className="rise">
      <PageHeader title="Settings" />
      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {sections.map(({ href, icon: Icon, label, description }) => (
          <Link key={href} href={href} className="flex items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-accent">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-dashed">
        {later.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0">
            <div className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="size-5" />
            </div>
            <p className="flex-1 text-muted-foreground">{label}</p>
            <span className="text-xs text-muted-foreground">Coming later</span>
          </div>
        ))}
      </section>
    </div>
  );
}
