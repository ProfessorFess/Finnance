import type { RuleMatchType, RuleOrigin } from "@/server/db/schema";

export type RuleLike = {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  priority: number;
  createdFrom: RuleOrigin;
  createdAt: Date;
};

function matches(rule: RuleLike, t: { merchant: string | null; description: string }): boolean {
  const pattern = rule.pattern.toLowerCase();
  switch (rule.matchType) {
    case "merchant_equals":
      return (t.merchant ?? "").toLowerCase() === pattern;
    case "description_contains": {
      // Whole words only, so "uber" doesn't match "Huber's" and "shell" doesn't match "Shelley's".
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
      return re.test(t.description) || re.test(t.merchant ?? "");
    }
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(t.description);
      } catch {
        return false;
      }
  }
}

/**
 * The rule that decides this transaction: highest priority first, then the
 * user's own rules before built-ins, then the newest.
 */
export function matchRule(rules: RuleLike[], t: { merchant: string | null; description: string }): RuleLike | null {
  const ordered = [...rules].sort(
    (a, b) =>
      b.priority - a.priority ||
      Number(a.createdFrom === "default") - Number(b.createdFrom === "default") ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return ordered.find((r) => matches(r, t)) ?? null;
}

/** Built-in merchant rules every user starts with (spec 7.5: cold start). Category by name. */
export const DEFAULT_RULES: { matchType: RuleMatchType; pattern: string; category: string; priority: number }[] = [
  { matchType: "description_contains", pattern: "uber eats", category: "Restaurants", priority: 20 },
  { matchType: "description_contains", pattern: "doordash", category: "Restaurants", priority: 10 },
  { matchType: "description_contains", pattern: "uber", category: "Rideshare & transit", priority: 10 },
  { matchType: "description_contains", pattern: "lyft", category: "Rideshare & transit", priority: 10 },
  ...["netflix", "hulu", "spotify", "prime video", "peacock", "disney+", "hbomax", "xbox", "nintendo"].map((p) => ({
    matchType: "description_contains" as const,
    pattern: p,
    category: "Subscriptions",
    priority: 10,
  })),
  { matchType: "description_contains", pattern: "starbucks", category: "Coffee", priority: 10 },
  ...["shell", "exxon", "valero", "chevron", "circle k", "circlek", "buc-ee"].map((p) => ({
    matchType: "description_contains" as const,
    pattern: p,
    category: "Gas & fuel",
    priority: 10,
  })),
  ...["h-e-b", "central market", "whole foods", "trader joe"].map((p) => ({
    matchType: "description_contains" as const,
    pattern: p,
    category: "Groceries",
    priority: 10,
  })),
  { matchType: "description_contains", pattern: "interest paid", category: "Interest", priority: 10 },
  { matchType: "description_contains", pattern: "dividend", category: "Interest", priority: 10 },
  { matchType: "regex", pattern: "\\bATM\\b", category: "Cash", priority: 10 },
  { matchType: "regex", pattern: "\\bfee\\b", category: "Fees", priority: 10 },
];
