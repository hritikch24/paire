import { logger } from "firebase-functions";

/**
 * Optional Claude integration. Without ANTHROPIC_API_KEY every AI feature uses
 * the free built-in generators (lib/suggestions.ts); with it, Claude writes more
 * personal suggestions and the built-ins remain the fallback.
 *
 * Test server: put the key in .test-backend/anthropic-api-key. Production: set
 * it as a secret, then `firebase deploy --only functions`.
 */
const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 15_000;

export const llmEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "disabled");

/**
 * Asks Claude for a JSON object and returns it parsed, or null on any failure
 * (no key, timeout, API error, unparsable output): callers fall back.
 */
export async function askClaudeForJson(
  system: string,
  prompt: string,
  maxTokens = 600,
  options: { model?: string; timeoutMs?: number } = {}
): Promise<unknown | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "disabled") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model || process.env.MUSE_AI_MODEL || DEFAULT_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) {
      logger.warn("Claude request failed", { status: response.status });
      return null;
    }
    const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (body.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return json ? JSON.parse(json) : null;
  } catch (error) {
    logger.warn("Claude request failed", { error: String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
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
