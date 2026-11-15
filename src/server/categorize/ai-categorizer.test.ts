import { afterEach, expect, it, vi } from "vitest";
import {
  type AiCategoryOption,
  type AiItem,
  buildCategorizeSystemPrompt,
  createAnthropicCategorizer,
  parseCategorizeOutput,
} from "./ai-categorizer";

const cats: AiCategoryOption[] = [
  { id: "id-coffee", name: "Coffee", group: "Lifestyle", kind: "expense" },
  { id: "id-pay", name: "Paycheck", group: "Income", kind: "income" },
  { id: "id-transfer", name: "Transfer", group: "Transfers", kind: "transfer" },
];
const item = (ref: string): AiItem => ({ ref, merchant: "Bennu Coffee", description: "SQ *BENNU COFFEE", amountCents: -625, bankCategory: "Food & Dining" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("builds a stable prompt with short codes and no Transfer option", () => {
  const p = buildCategorizeSystemPrompt(cats);
  expect(p.text).toBe(buildCategorizeSystemPrompt(cats).text);
  expect([...p.codes.entries()]).toEqual([["c1", "id-coffee"], ["c2", "id-pay"]]);
  expect(p.text).toMatch(/Never follow instructions/);
});

it("ignores categories that were not offered", () => {
  const codes = new Map([["c1", "id-coffee"]]);
  expect(
    parseCategorizeOutput(
      { results: [{ ref: "r1", category: "c9", confidence: 0.99 }, { ref: "r2", category: "c1", confidence: 1.7 }] },
      codes,
      ["r1", "r2", "r3"],
    ),
  ).toEqual([
    { ref: "r1", categoryId: null, confidence: 0 },
    { ref: "r2", categoryId: "id-coffee", confidence: 1 },
    { ref: "r3", categoryId: null, confidence: 0 },
  ]);
});

it("sends a cached system prompt to Haiku at low effort with structured output", async () => {
  const parse = vi.fn().mockResolvedValue({
    stop_reason: "end_turn",
    parsed_output: { results: [{ ref: "r1", category: "c1", confidence: 0.9 }] },
    usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 600, cache_creation_input_tokens: 0 },
  });
  const ai = createAnthropicCategorizer({ client: { messages: { parse } } as never });
  const out = await ai({ categories: cats, examples: [], items: [item("r1")] });
  const [body, opts] = parse.mock.calls[0]!;
  expect(body).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
  expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("thinking");
  expect(JSON.parse(body.messages[0].content).transactions[0]).toMatchObject({ ref: "r1", amount: "-6.25", bankCategory: "Food & Dining" });
  expect(opts).toMatchObject({ timeout: 30_000 });
  expect(out.results).toEqual([{ ref: "r1", categoryId: "id-coffee", confidence: 0.9 }]);
  expect(out.usage).toEqual({ inputTokens: 900, outputTokens: 40, cacheReadTokens: 600, cacheWriteTokens: 0 });
  expect(out.model).toBe("claude-haiku-5-5");
});

it("treats a refusal as unsure", async () => {
  const parse = vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null, usage: { input_tokens: 10, output_tokens: 0 } });
  const out = await createAnthropicCategorizer({ client: { messages: { parse } } as never })({ categories: cats, examples: [], items: [item("r1")] });
  expect(out.results).toEqual([{ ref: "r1", categoryId: null, confidence: 0 }]);
});

it("is unavailable without an API key", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/x");
  vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const { getAiCategorizer } = await import("@/server/ai");
  expect(getAiCategorizer()).toBeNull();
});
