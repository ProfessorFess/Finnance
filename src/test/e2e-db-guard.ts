/**
 * The e2e setup truncates tables, so refuse anything that could be real data:
 * only local hosts or databases whose name ends in "_test" are allowed.
 */
export function assertSafeE2EDatabase(url: string): void {
  let host = "";
  let dbName = "";
  try {
    const u = new URL(url);
    host = u.hostname;
    dbName = u.pathname.replace(/^\//, "");
  } catch {
    // fall through to the error below
  }
  if (host === "localhost" || host === "127.0.0.1" || dbName.endsWith("_test")) return;
  throw new Error("E2E_DATABASE_URL must point at a local or *_test database");
}
