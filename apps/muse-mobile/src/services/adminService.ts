import { callFunction } from "./firebase";

/** Moderator-only member admin (the server checks the moderator claim). */
export type MemberRow = {
  uid: string;
  name: string;
  age: number | null;
  city: string | null;
  photoUrl: string | null;
  photoCount: number;
  joinedAt: number | null;
  lastActiveAt: number | null;
  status: string;
  verified: boolean;
  testAccount: boolean;
  plus: boolean;
  unlimitedChat: boolean;
};

export type MemberPayment = { source: "razorpay" | "upi"; product: string; amountInr: number; status: string; at: number | null; utr?: string | null; expiresAt?: number | null };

export type MemberDetail = {
  uid: string;
  profile: {
    name: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    bio: string | null;
    photoUrls: string[];
    interests: string[];
    intentions: string[];
    languages: string[];
    basics: Record<string, string | number>;
    discoverable: boolean;
    joinedAt: number | null;
    lastActiveAt: number | null;
  };
  account: { email: string | null; emailVerified: boolean; signInMethods: string[]; createdAt: number | null; lastSignInAt: number | null; disabled: boolean } | null;
  moderation: { status: string; reason: string | null; cohort: string; verification: string };
  activity: { matches: number; reportsAgainst: number };
  payments: MemberPayment[];
  plusUntil: number | null;
  unlimitedChat: boolean;
};

export const listMembers = (gender: "woman" | "man", cursor?: string | null) =>
  callFunction<{ members: MemberRow[]; nextCursor: string | null; total: number }>("adminListMembers", { gender, cursor: cursor ?? null }, 60_000);

export const getMember = (uid: string) => callFunction<MemberDetail>("adminGetMember", { uid }, 60_000);
