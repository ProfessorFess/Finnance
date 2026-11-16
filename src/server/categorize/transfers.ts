const TRANSFER_RE = /\b(transfer|zelle)\b|internet banking|\bshare \d{2,}\b/i;

/** Descriptions that look like money moving between accounts (not purchases). */
export function isTransferLike(description: string): boolean {
  return TRANSFER_RE.test(description);
}

const isZelle = (d: string) => /\bzelle\b/i.test(d);

/** The other person on a Zelle row: "to NAME" on money out (last one), "from NAME" on money in. */
function zelleName(description: string, direction: "out" | "in"): string[] | null {
  let name: string | undefined;
  if (direction === "out") {
    const i = description.toLowerCase().lastIndexOf(" to ");
    if (i >= 0) name = description.slice(i + 4).split("(")[0];
  } else {
    const m = /\bfrom\s+(.+?)(?:\s+to\b|\s*\(|$)/i.exec(description);
    name = m?.[1];
  }
  // Ignore single letters (middle initials) so "Alex Q Sample" matches "ALEX SAMPLE".
  const tokens = (name ?? "").toLowerCase().split(/[^a-z']+/).filter((t) => t.length >= 2);
  return tokens.length ? tokens : null;
}

/**
 * Zelle rows only pair with Zelle rows naming the same person on both sides —
 * that's a transfer to yourself. Paying one friend and being paid by another
 * the same amount is not a transfer.
 */
function compatible(out: PairCandidate, inn: PairCandidate): boolean {
  const zOut = isZelle(out.description);
  const zIn = isZelle(inn.description);
  if (!zOut && !zIn) return true;
  if (zOut !== zIn) return false;
  const a = zelleName(out.description, "out");
  const b = zelleName(inn.description, "in");
  if (!a || !b) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return small.every((t) => big.includes(t));
}

export type PairCandidate = { id: string; accountId: string; date: string; amountCents: number; description: string };

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/**
 * Pairs outflows with inflows that look like the two sides of one transfer:
 * both transfer-like, different accounts, exactly opposite amounts, within
 * `maxDays`. One-to-one, nearest date first, so repeated identical transfers
 * pair in order instead of all grabbing the same row.
 */
export function pairTransfers(rows: PairCandidate[], maxDays = 5): [outId: string, inId: string][] {
  const candidates = rows.filter((r) => isTransferLike(r.description));
  const byOrder = (a: PairCandidate, b: PairCandidate) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
  const outs = candidates.filter((r) => r.amountCents < 0).sort(byOrder);
  const ins = candidates.filter((r) => r.amountCents > 0).sort(byOrder);
  const used = new Set<string>();
  const pairs: [string, string][] = [];

  for (const out of outs) {
    let best: PairCandidate | null = null;
    let bestGap = Infinity;
    for (const inn of ins) {
      if (used.has(inn.id) || inn.accountId === out.accountId || inn.amountCents !== -out.amountCents) continue;
      if (!compatible(out, inn)) continue;
      const gap = Math.abs(dayNumber(inn.date) - dayNumber(out.date));
      if (gap > maxDays) continue;
      // `ins` is sorted by date then id, so the first at the smallest gap wins ties.
      if (gap < bestGap) {
        best = inn;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      pairs.push([out.id, best.id]);
    }
  }
  return pairs;
}
