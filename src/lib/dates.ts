export type DateFormat = "YYYY-MM-DD" | "MM/DD/YYYY" | "M/D/YYYY" | "DD/MM/YYYY";

type Part = "y" | "m" | "d";

const PATTERNS: Record<DateFormat, { re: RegExp; order: [Part, Part, Part] }> = {
  "YYYY-MM-DD": { re: /^(\d{4})-(\d{2})-(\d{2})$/, order: ["y", "m", "d"] },
  "MM/DD/YYYY": { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: ["m", "d", "y"] },
  "M/D/YYYY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ["m", "d", "y"] },
  "DD/MM/YYYY": { re: /^(\d{2})\/(\d{2})\/(\d{4})$/, order: ["d", "m", "y"] },
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Parses a bank date into "YYYY-MM-DD" as a pure calendar date: no Date
 * objects, so the server's timezone can never shift it. Rejects impossible dates.
 */
export function parseDateValue(raw: string, format: DateFormat): string | null {
  const { re, order } = PATTERNS[format];
  const m = re.exec(raw.trim());
  if (!m) return null;
  const parts: Record<Part, number> = { y: 0, m: 0, d: 0 };
  order.forEach((key, i) => (parts[key] = Number(m[i + 1])));
  if (parts.m < 1 || parts.m > 12 || parts.d < 1 || parts.d > daysInMonth(parts.y, parts.m)) return null;
  return `${pad(parts.y, 4)}-${pad(parts.m)}-${pad(parts.d)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-14" → "Nov 14, 2026", computed from the string (timezone-proof). */
export function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${d}, ${y}`;
}

/** Days in a month (month 1–12). */
export function lastDayOfMonth(year: number, month: number): number {
  return daysInMonth(year, month);
}

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → days since 1970-01-01, computed in UTC so local time never shifts it. */
function toDayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

function fromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Calendar date plus n days (n may be negative). */
export function addDays(iso: string, n: number): string {
  return fromDayNumber(toDayNumber(iso) + n);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Today's calendar date in the given IANA timezone, e.g. "America/Chicago". */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
