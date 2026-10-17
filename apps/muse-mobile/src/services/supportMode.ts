/** Native builds never enter the browser support flow. */
export const isSupportView = false;
export type SupportDetails = { sessionId: string; uid: string; name: string; email: string | null; metadata: { creationTime: string; lastSignInTime: string | null }; emailVerified: boolean; expiresAt: number };
export const supportContext: { current: SupportDetails | null } = { current: null };
