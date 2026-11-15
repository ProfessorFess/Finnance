import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicPath } from "@/lib/public-paths";

/**
 * Optimistic only: no session cookie → redirect to sign-in, remembering where
 * the user was going. Every page, route handler, and Server Action must check
 * the session itself (requireUser / getSession); a cookie's presence proves nothing.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
