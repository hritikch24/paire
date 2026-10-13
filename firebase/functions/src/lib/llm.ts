import { logger } from "firebase-functions";

/**
 * Optional AI for Paire AI (icebreakers, bios, vibe matching, chat-safety second
 * opinions). Without a provider every feature uses the free built-in generators
 * (lib/suggestions.ts), which also remain the fallback on any AI failure.
 *
 * Providers, in order:
 *  1. Claude, when the ANTHROPIC_API_KEY secret holds a real key.
 *  2. Gemini on Vertex AI, when MUSE_GEMINI_ENABLED=true. It runs as the Cloud
 *     Functions service account inside this Firebase project, so no API key is
 *     needed: usage is billed to the project (Blaze). Needs the Vertex AI API
 *     (aiplatform.googleapis.com) enabled on the project.
 *
 * Test server: put a Claude key in .test-backend/anthropic-api-key.
 */
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
/** Stable Flash model on Vertex AI (supported until at least May 2027). Override with MUSE_GEMINI_MODEL. */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const TIMEOUT_MS = 15_000;

export type AiProvider = "claude" | "gemini";

const claudeKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key !== "disabled" ? key : null;
};

/** Which AI writes, or null for the built-in generators only. */
export function aiProvider(): AiProvider | null {
  if (claudeKey()) return "claude";
  if (geminiEnabled()) return "gemini";
  return null;
}

export const llmEnabled = () => aiProvider() !== null;

export type AiImage = { mimeType: string; data: Buffer };
type AskOptions = {
  model?: string;
  timeoutMs?: number;
  /** Images shown to the model before the prompt, in order. */
  images?: AiImage[];
  /** Gemini model for this request instead of MUSE_GEMINI_MODEL. */
  geminiModel?: string;
  /** Only this provider (e.g. where consent names it); null if it isn't set up. */
  provider?: AiProvider;
};

/** The JSON object inside a model's text reply, or null. */
export function parseJsonReply(text: string): unknown | null {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return json ? JSON.parse(json) : null;
}

/**
 * Asks the configured AI for a JSON object and returns it parsed, or null on any
 * failure (no provider, timeout, API error, unparsable output): callers fall back.
 * `options.model` names a Claude model; Gemini uses `options.geminiModel` or MUSE_GEMINI_MODEL.
 */
/** Gemini is set up (deployed functions only: it uses the server's own Google identity). */
export const geminiEnabled = () => process.env.MUSE_GEMINI_ENABLED === "true" && process.env.FUNCTIONS_EMULATOR !== "true";

export async function askAiForJson(system: string, prompt: string, maxTokens = 600, options: AskOptions = {}): Promise<unknown | null> {
  const provider = options.provider === "gemini" ? (geminiEnabled() ? "gemini" : null) : options.provider === "claude" ? (claudeKey() ? "claude" : null) : aiProvider();
  if (!provider) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const text =
      provider === "claude"
        ? await askClaude(system, prompt, maxTokens, options, controller.signal)
        : await askGemini(system, prompt, maxTokens, options, controller.signal);
    return text === null ? null : parseJsonReply(text);
  } catch (error) {
    logger.warn("AI request failed", { provider, error: String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function askClaude(system: string, prompt: string, maxTokens: number, { model, images = [] }: AskOptions, signal: AbortSignal): Promise<string | null> {
  const content = [
    ...images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data.toString("base64") } })),
    { type: "text", text: prompt }
  ];
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    signal,
    headers: { "x-api-key": claudeKey() as string, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: model || process.env.MUSE_AI_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }]
    })
  });
  if (!response.ok) {
    logger.warn("Claude request failed", { status: response.status });
    return null;
  }
  const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return (body.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}

async function askGemini(system: string, prompt: string, maxTokens: number, { images = [], geminiModel }: AskOptions, signal: AbortSignal): Promise<string | null> {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) return null;
  // The Cloud Functions service account's token, from the metadata server: no key to store.
  const tokenResponse = await fetch(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" }, signal });
  if (!tokenResponse.ok) {
    logger.warn("Gemini token request failed", { status: tokenResponse.status });
    return null;
  }
  const { access_token: token } = (await tokenResponse.json()) as { access_token?: string };
  if (!token) return null;
  const model = geminiModel || process.env.MUSE_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data.toString("base64") } })), { text: prompt }] }],
        // Room for the model's own reasoning tokens on top of the reply.
        generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 2048), responseMimeType: "application/json", ...(images.length ? { temperature: 0 } : {}) }
      })
    }
  );
  if (!response.ok) {
    logger.warn("Gemini request failed", { status: response.status, model });
    return null;
  }
  const body = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (body.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
}

/** Keeps only short, non-empty strings from a model's list. */
export function cleanLines(value: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 0 && item.length <= maxLength)
    .slice(0, max);
}
