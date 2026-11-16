import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSetupStatus } from "@/server/home/setup-service";

// Every page here needs the session, so let the route block on the server for the
// auth check (proper 307 redirects) instead of streaming behind Suspense.
export const instant = false;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const setup = await getSetupStatus(getDb(), user.id);
  return (
    <AppShell user={user} showSetup={!setup.complete}>
      {children}
    </AppShell>
  );
}
