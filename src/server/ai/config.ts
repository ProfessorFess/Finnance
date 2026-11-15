/** The only place model IDs and prices live. */
export const AI_MODELS = {
  categorize: "claude-haiku-5-5",
} as const;

/** USD per million tokens (prompts ≤100K tokens). */
export const PRICES_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type AiUsageTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Cost in millionths of a dollar, rounded up. Unknown models are priced at zero. */
export function costMicros(model: string, usage: AiUsageTokens): number {
  const p = PRICES_PER_MTOK[model];
  if (!p) return 0;
  // $/MTok × tokens = µ$ exactly (1e6 µ$ per $ cancels 1e6 tokens per MTok).
  const micros =
    p.input * usage.inputTokens +
    p.output * usage.outputTokens +
    p.cacheRead * usage.cacheReadTokens +
    p.cacheWrite * usage.cacheWriteTokens;
  return Math.ceil(Math.round(micros * 1000) / 1000);
}
