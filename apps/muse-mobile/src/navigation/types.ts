import type { NavigatorScreenParams } from "@react-navigation/native";
import type { ProfileViewData } from "../components/ProfileDetails";
import type { ReportReason, SwipeType } from "../types/models";

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: { email?: string } | undefined;
  AuthHelp: undefined;
};

export type OnboardingStackParamList = {
  Basics: undefined;
  Photos: undefined;
  Interests: undefined;
};

export type MainTabsParamList = {
  /** `swipe` lets the full-profile screen act on the card it was opened from. */
  Discover: { swipe?: { uid: string; type: SwipeType; nonce: number }; intent?: { edition: "people" | "garba"; nonce: number } } | undefined;
  Matches: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  Chat: { matchId: string; otherUid?: string; name?: string; photoUrl?: string | null };
  ProfileView: {
    /** `likes`: someone from "Likes you", answered from the profile itself. */
    source: "discover" | "match" | "self" | "likes" | "shared";
    profile?: ProfileViewData;
    uid?: string;
    matchId?: string;
  };
  EditProfile: undefined;
  EditPhotos: undefined;
  Settings: undefined;
  SafetyCenter: undefined;
  MyReports: { blocked?: boolean } | undefined;
  Verification: undefined;
  Premium: undefined;
  UpiReview: undefined;
  MemberAdmin: undefined;
  AdminPremium: undefined;
  AdminNotifications: undefined;
  RecentPremiumBuyers: undefined;
  MemberAdminDetail: { uid: string; name?: string };
  VibeGuide: undefined;
  Appearance: undefined;
  /** Everyone in a Duo chat: view, report or block. */
  ChatMembers: { matchId: string };
  /** Your Duo: your friend, your pair's likes, leave. */
  Duo: undefined;
  /** Everyone who liked you, as a photo gallery. */
  LikesGallery: undefined;
  Report: { targetUid: string; name?: string; matchId?: string; messageId?: string; reason?: ReportReason };
  Call: { matchId: string; video: boolean };
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  VerifyEmail: undefined;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  App: NavigatorScreenParams<AppStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
