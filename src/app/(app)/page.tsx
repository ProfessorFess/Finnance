import { PageHeader } from "@/components/empty-state";
import { HomeGrid } from "@/components/home/home-grid";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSettings } from "@/server/finance/settings";
import { loadHome } from "@/server/home/dashboard-service";

export const metadata = { title: "Home · Finnance" };

function greeting(timeZone: string, now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const user = await requireUser();
  const db = getDb();
  const now = new Date();
  const [settings, home] = await Promise.all([getSettings(db, user.id), loadHome(db, user.id, now)]);
  return (
    <div className="rise">
      <PageHeader title="Home" description={`${greeting(settings.timezone, now)}. Here's where your money stands.`} />
      <HomeGrid widgets={home.widgets} />
    </div>
  );
}
