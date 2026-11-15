import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-next";
import { getSession } from "@/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Finnance" };

// Reads the session and searchParams to redirect signed-in users.
export const instant = false;

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  if (await getSession()) redirect(nextPath);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <SignInForm nextPath={nextPath} />
    </main>
  );
}
