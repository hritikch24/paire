import { aiProvider, parseJsonReply } from "../src/lib/llm";

describe("Paire AI provider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test("Claude first, then Gemini on Vertex AI, else the built-in writer", () => {
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
