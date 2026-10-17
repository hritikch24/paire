export type SupportDetails = { sessionId: string; uid: string; name: string; email: string | null; metadata: { creationTime: string; lastSignInTime: string | null }; emailVerified: boolean; expiresAt: number };
export const isSupportView = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("support") === "1";
export const supportContext: { current: SupportDetails | null } = { current: null };
