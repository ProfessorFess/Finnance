/**
 * Parses a bank amount string into integer cents without floating point.
 * Accepts "$", thousands commas, surrounding spaces, a leading "-", and
 * accounting-style parentheses for negatives. At most 2 decimal places.
 */
export function parseAmountToCents(raw: string): number | null {
  let s = raw.trim().replace(/[$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return negative && cents !== 0 ? -cents : cents;
}

const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,234.56", "-$16.40"; with `sign: "always"` positive amounts get "+". */
export function formatCents(cents: number, opts: { sign?: "auto" | "always" } = {}): string {
  const body = `$${usd.format(Math.abs(cents) / 100)}`;
  if (cents < 0) return `-${body}`;
  if (cents > 0 && opts.sign === "always") return `+${body}`;
  return body;
}
