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
