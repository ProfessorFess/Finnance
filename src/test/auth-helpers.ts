import type { Auth } from "@/server/auth/auth";

/**
 * Signs in through the server API and returns the resulting cookies as a single
 * `cookie` header value, plus whether a two-factor step is pending.
 */
export async function signInForCookie(
  auth: Auth,
  email: string,
  password: string,
): Promise<{ cookie: string; twoFactorRedirect: boolean }> {
  const { headers, response } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const twoFactorRedirect = "twoFactorRedirect" in response && response.twoFactorRedirect === true;
  return { cookie, twoFactorRedirect };
}
