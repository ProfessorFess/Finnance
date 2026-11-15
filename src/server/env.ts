import { z } from "zod";

export type Env = {
  databaseUrl: string;
  authSecret: string;
  authBaseUrl: string;
  trustedOrigins: string[];
  allowSignup: boolean;
  anthropicApiKey?: string;
};

/** Empty strings count as unset. */
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z
  .object({
    DATABASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url()),
    BETTER_AUTH_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32)),
    BETTER_AUTH_URL: optional,
    VERCEL_URL: optional,
    VERCEL_BRANCH_URL: optional,
    VERCEL_ENV: optional,
    VERCEL_PROJECT_PRODUCTION_URL: optional,
    ALLOW_SIGNUP: optional,
    ANTHROPIC_API_KEY: optional,
  })
  .refine((e) => e.BETTER_AUTH_URL !== undefined || e.VERCEL_URL !== undefined, {
    path: ["BETTER_AUTH_URL"],
    message: "required when not running on Vercel",
  });

/**
 * Validates environment variables. Error messages name the variables that are
 * wrong but never include their values, so secrets don't leak into logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Invalid environment: ${names.join(", ")}`);
  }
  const e = result.data;
  const https = (h: string | undefined) => (h === undefined ? undefined : `https://${h}`);
  const productionUrl = https(e.VERCEL_PROJECT_PRODUCTION_URL);
  const deploymentUrls = [e.VERCEL_URL, e.VERCEL_BRANCH_URL].map(https).filter((u) => u !== undefined);
  // On Vercel production, default to the stable production alias (what the owner
  // actually opens), not the per-deployment URL. Previews use their own URL.
  const authBaseUrl =
    e.BETTER_AUTH_URL ??
    (e.VERCEL_ENV === "production" && productionUrl ? productionUrl : deploymentUrls[0]!);

  return {
    databaseUrl: e.DATABASE_URL,
    authSecret: e.BETTER_AUTH_SECRET,
    authBaseUrl,
    trustedOrigins: [...new Set([authBaseUrl, ...deploymentUrls, ...(productionUrl ? [productionUrl] : [])])],
    allowSignup: e.ALLOW_SIGNUP === "true",
    anthropicApiKey: e.ANTHROPIC_API_KEY,
  };
}

let cached: Env | undefined;

/** Parses `process.env` once and caches the result. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
