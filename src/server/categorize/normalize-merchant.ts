const PREFIXES = /^(TST\*\s*|SQ\s*\*\s*|SP\s+|PY\s*\*\s*|NNT\s+)/i;
const LOCATION_SUFFIX = /,\s*[A-Z]{2},\s*US$/i;
const TWO_WORD_CITIES = new Set(["SAN ANTONIO", "NEW YORK", "SAN FRANCISCO", "LOS ANGELES", "SAN DIEGO", "EL PASO", "FORT WORTH", "LAS VEGAS", "SAN JOSE", "CORPUS CHRISTI", "ROUND ROCK", "SAN MARCOS", "COLLEGE STATION"]);
const ACRONYMS = new Set(["BBQ", "HEB", "CVS", "ATM", "USAA", "ATT", "UPS", "TX"]);

function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => {
      if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      const lower = word.toLowerCase();
      // Capitalize the first letter only, so "CHI'LANTRO" → "Chi'lantro" and "BOB'S" → "Bob's".
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Turns a bank's raw description into a readable merchant name, e.g.
 * "TST* HAYMAKER 2310 MANOR RD AUSTIN, TX, US" → "Haymaker". Descriptions that
 * are already clean (mixed case, no ", TX, US" tail, like UFCU's) only get
 * their whitespace tidied.
 */
export function normalizeMerchant(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const hasLocation = LOCATION_SUFFIX.test(text);
  if (/[a-z]/.test(text) && !hasLocation) return text;

  let s = text.replace(PREFIXES, "").trim();
  const words = s.split(" ");
  // Cut at the first address/store number: 3+ digits, or a store code like T-1234.
  const cutAt = words.findIndex((w, i) => i > 0 && (/^\d{3,}/.test(w) || /^[A-Z]-\d{2,}$/i.test(w)));
  let cut = false;
  if (cutAt > 0) {
    s = words.slice(0, cutAt).join(" ");
    cut = true;
  }
  // Cut a " - LOCATION" suffix ("PAVEMENT - GUADALUPE").
  const dash = s.indexOf(" - ");
  if (dash > 0) {
    s = s.slice(0, dash);
    cut = true;
  }
  if (!cut && hasLocation) {
    const parts = s.replace(LOCATION_SUFFIX, "").trim().split(" ");
    const lastTwo = parts.slice(-2).join(" ").toUpperCase();
    s = parts.slice(0, TWO_WORD_CITIES.has(lastTwo) ? -2 : -1).join(" ");
  }
  s = s.trim();
  return s ? titleCase(s) : text;
}
