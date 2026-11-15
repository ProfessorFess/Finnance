/**
 * One live call to Claude Haiku with three made-up transactions, to confirm the
 * API key and categorizer work end to end. Costs well under $0.01.
 *   pnpm ai:smoke            # reads ANTHROPIC_API_KEY from .env.local
 * Not run in CI.
 */
import { existsSync } from "node:fs";
import { config } from "dotenv";
import { costMicros } from "@/server/ai/config";
import { createAnthropicCategorizer } from "@/server/categorize/ai-categorizer";
import { DEFAULT_CATEGORIES } from "@/server/finance/categories";

async function main() {
  if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY in .env.local first");

  const categories = DEFAULT_CATEGORIES.map((c) => ({ id: c.name, name: c.name, group: c.group, kind: c.kind }));
  const ai = createAnthropicCategorizer({ apiKey });
  const items = [
    { ref: "1", merchant: "Bennu Coffee", description: "SQ *BENNU COFFEE 2001 E MLK AUSTIN, TX, US", amountCents: -625, bankCategory: null },
    { ref: "2", merchant: "Payroll Acme Corp", description: "Payroll Acme Corp", amountCents: 120_000, bankCategory: "Income" },
    { ref: "3", merchant: "Netflix.com", description: "NETFLIX.COM LOS GATOS, CA, US", amountCents: -1549, bankCategory: null },
  ];
  const out = await ai({ categories, examples: [], items });
  for (const r of out.results) {
    const it = items.find((i) => i.ref === r.ref)!;
    console.log(`${it.merchant.padEnd(20)} -> ${r.categoryId ?? "unknown"} (${Math.round(r.confidence * 100)}% sure)`);
  }
  if (out.usage) {
    const cost = costMicros(out.model, out.usage) / 1e6;
    console.log(`cost: $${cost.toFixed(6)} (${out.usage.inputTokens} in, ${out.usage.outputTokens} out)`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
