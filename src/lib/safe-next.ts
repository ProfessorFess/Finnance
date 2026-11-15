const PROBE_ORIGIN = "http://next.invalid";

/**
 * Returns `next` only if it resolves to a same-site path (prevents open
 * redirects via `/sign-in?next=...`). It's checked by actually resolving it the
 * way browsers do, because the URL parser silently strips tabs and newlines
 * (so "/\t/evil.example" would otherwise become "//evil.example").
 * Anything else, including the sign-in page itself, becomes "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PROBE_ORIGIN) return "/";
  if (url.pathname === "/sign-in" || url.pathname.startsWith("/sign-in/")) return "/";
  return url.pathname + url.search + url.hash;
}
