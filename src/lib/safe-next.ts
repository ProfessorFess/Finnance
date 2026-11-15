/**
 * Returns `next` only if it's a same-site path (prevents open redirects via
 * `/sign-in?next=...`). Anything else, including the sign-in page itself, becomes "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next[1] === "/" || next[1] === "\\") return "/";
  const path = next.split(/[?#]/)[0]!;
  if (path === "/sign-in" || path.startsWith("/sign-in/")) return "/";
  return next;
}
