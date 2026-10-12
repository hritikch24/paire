import { callFunction } from "./firebase";

/** "claude" or "gemini" when written by Paire AI; "muse" from the free built-in writer. */
export type Suggestions = { suggestions: string[]; source: "claude" | "gemini" | "muse" };

/** Three ways to start the conversation in a new match. */
export function fetchOpeners(matchId: string): Promise<Suggestions> {
  return callFunction<Suggestions>("suggestOpeners", { matchId });
}

/** Three bio drafts from the member's own interests and choices. */
export function fetchBioSuggestions(): Promise<Suggestions> {
  return callFunction<Suggestions>("suggestBio", {});
}
