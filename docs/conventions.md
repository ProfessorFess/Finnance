# Finnance conventions

Rules every change follows. They exist so the app stays correct and safe as it grows from one user to many.

## Data and access
- **Every service function takes `userId` and filters by it.** No query reads or writes user data without that scope. Each service test includes an "isolates users" case.
- **Server Actions** call `requireUser()` first, validate input with Zod, and pass `user.id` to a service. They never accept a user id from the client.
- **The proxy (`src/proxy.ts`) is only a fast redirect.** It checks that a cookie exists, which proves nothing. Every page, route handler, and Server Action must check the session itself.
- **Every data change made through a service writes an `activity_log` row.** This is what undo and history are built on.

## Money and dates
- Money is **integer cents** (`bigint` with `mode: "number"`). Negative means money out, positive means money in.
- Bank dates are **calendar dates** (`YYYY-MM-DD`, Postgres `date`). Never parse them with `new Date(...)`; use `parseDateValue` / `formatDisplayDate`.

## Data safety
- **Real bank data never goes in the repo.** Test fixtures are synthetic rows in the real formats.
- E2E tests truncate their database, so `E2E_DATABASE_URL` must be local or end in `_test` (enforced).

## Migrations
- **Add first, remove later.** Vercel runs migrations before the new build goes live, so a migration must not break the currently deployed code. Add new columns and tables in one release, and drop old ones in a later release once nothing uses them.

## Secrets
- **Never change `BETTER_AUTH_SECRET`** in production. TOTP secrets and backup codes are encrypted with it, so changing it locks out anyone with two-step login, including the backup-code recovery path.
