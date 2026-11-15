import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export type CreateAuthOptions = {
  baseURL: string;
  secret: string;
  trustedOrigins?: string[];
  allowSignup: boolean;
  rateLimitEnabled?: boolean;
};

export function createAuth(db: Database, options: CreateAuthOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignup,
      minPasswordLength: 12,
    },
    rateLimit: {
      enabled: options.rateLimitEnabled ?? false,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
      },
    },
    plugins: [twoFactor({ issuer: "Finnance" }), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
