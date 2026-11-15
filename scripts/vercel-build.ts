/** Vercel build: apply migrations when safe (see shouldMigrate), then build. */
import { execSync } from "node:child_process";
import { shouldMigrate } from "../src/server/deploy/should-migrate";

const { migrate, reason } = shouldMigrate(process.env);
console.log(`[vercel-build] migrations: ${migrate ? "yes" : "no"} (${reason})`);
if (migrate) execSync("pnpm db:migrate", { stdio: "inherit" });
execSync("pnpm build", { stdio: "inherit" });
