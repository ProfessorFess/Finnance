const PUBLIC_PREFIXES = ["/sign-in", "/api/auth", "/icons"];
const PUBLIC_FILES = new Set(["/manifest.webmanifest", "/icon.svg", "/apple-icon.png", "/favicon.ico"]);

/** Paths reachable without a session. Prefixes match exactly or at a "/" boundary. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
