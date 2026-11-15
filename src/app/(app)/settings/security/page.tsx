import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/empty-state";
import { TwoFactorCard } from "@/components/settings/two-factor-card";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Security · Finnance" };

export default async function SecurityPage() {
  const user = await requireUser();
  return (
    <div className="rise">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Settings
      </Link>
      <PageHeader title="Security" description="Keep your financial data private." />
      <TwoFactorCard enabled={user.twoFactorEnabled === true} />
    </div>
  );
}
