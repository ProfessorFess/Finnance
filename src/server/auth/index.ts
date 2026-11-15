import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { createAuth } from "./auth";

const env = getEnv();

/** The app's Better Auth instance. */
export const auth = createAuth(getDb(), {
  baseURL: env.authBaseUrl,
  secret: env.authSecret,
  trustedOrigins: env.trustedOrigins,
  allowSignup: env.allowSignup,
  rateLimitEnabled: process.env.NODE_ENV === "production",
});
