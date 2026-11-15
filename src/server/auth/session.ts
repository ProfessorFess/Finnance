import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./index";

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];

/** Cached per request, so the layout and page share one session lookup. */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** Returns the signed-in user, or redirects to /sign-in. */
export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
