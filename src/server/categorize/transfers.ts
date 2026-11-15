const TRANSFER_RE = /\b(transfer|zelle)\b|internet banking|\bshare \d{2,}\b/i;

/** Descriptions that look like money moving between accounts (not purchases). */
export function isTransferLike(description: string): boolean {
  return TRANSFER_RE.test(description);
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
