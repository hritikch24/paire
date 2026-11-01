import { aiProvider, askAiForJson, geminiEnabled, llmEnabled, parseJsonReply } from "../src/lib/llm";

describe("Paire AI provider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  test.each([undefined, "false", "TRUE", "1"])("paid AI fails closed with switch %s, including explicit provider requests", async (setting) => {
    if (setting === undefined) delete process.env.MUSE_PAID_AI_ENABLED;
    else process.env.MUSE_PAID_AI_ENABLED = setting;
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.ANTHROPIC_API_KEY = "sk-real";
    process.env.MUSE_GEMINI_ENABLED = "true";
    const network = jest.spyOn(global, "fetch").mockRejectedValue(new Error("No network allowed"));
    expect(aiProvider()).toBeNull();
    expect(llmEnabled()).toBe(false);
    expect(geminiEnabled()).toBe(false);
    for (const options of [{}, { provider: "claude" as const }, { provider: "gemini" as const }]) {
      expect(await askAiForJson("system", "prompt", 100, options)).toBeNull();
    }
    expect(network).not.toHaveBeenCalled();
  });

  test("Claude first, then Gemini on Vertex AI, else the built-in writer", () => {
    process.env.MUSE_PAID_AI_ENABLED = "true";
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.ANTHROPIC_API_KEY = "disabled";
    process.env.MUSE_GEMINI_ENABLED = "false";
    expect(aiProvider()).toBeNull();
    process.env.MUSE_GEMINI_ENABLED = "true";
    expect(aiProvider()).toBe("gemini");
    process.env.ANTHROPIC_API_KEY = "sk-real";
    expect(aiProvider()).toBe("claude");
  });

  test("Gemini is never called from the emulator (it has no service account)", () => {
    process.env.MUSE_PAID_AI_ENABLED = "true";
    process.env.ANTHROPIC_API_KEY = "disabled";
    process.env.MUSE_GEMINI_ENABLED = "true";
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(aiProvider()).toBeNull();
  });

  test("replies are read as JSON, even with text around them", () => {
    expect(parseJsonReply('Sure! {"suggestions": ["a", "b"]} Hope that helps')).toEqual({ suggestions: ["a", "b"] });
    expect(parseJsonReply("no json here")).toBeNull();
  });
});
