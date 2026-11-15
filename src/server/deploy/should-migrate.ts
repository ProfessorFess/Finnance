/**
 * Decides whether a Vercel build should apply database migrations.
 *
 * Fails closed for previews: if Neon's per-preview branching isn't actually in
 * effect, a preview's DATABASE_URL may be the production database, and an
 * unmerged branch's migrations would run against real data. The owner opts in
 * with MIGRATE_PREVIEWS=true (Preview env only) after confirming branching works.
 */
export function shouldMigrate(env: Record<string, string | undefined>): { migrate: boolean; reason: string } {
  switch (env.VERCEL_ENV) {
    case "production":
      return { migrate: true, reason: "production build" };
    case "preview":
      return env.MIGRATE_PREVIEWS === "true"
        ? { migrate: true, reason: "preview build with MIGRATE_PREVIEWS=true" }
        : {
            migrate: false,
            reason: "preview build: skipping migrations (set MIGRATE_PREVIEWS=true once preview database branching is confirmed)",
          };
    default:
      return { migrate: false, reason: "not a Vercel production or preview build" };
  }
}
