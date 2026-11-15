import { type AiCategorizer, createAnthropicCategorizer } from "@/server/categorize/ai-categorizer";
import { getEnv } from "@/server/env";

let cached: AiCategorizer | null | undefined;

/** The production categorizer, or null when no ANTHROPIC_API_KEY is configured. */
export function getAiCategorizer(): AiCategorizer | null {
  if (cached !== undefined) return cached;
  const apiKey = getEnv().anthropicApiKey;
  cached = apiKey ? createAnthropicCategorizer({ apiKey }) : null;
  return cached;
}
