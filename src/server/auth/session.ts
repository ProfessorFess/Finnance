import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** Returns the signed-in user, or redirects to /sign-in. */
export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
