import { Share } from "react-native";
import { env } from "../config/env";
import { getServerOrigin } from "./testServer";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.muse.app";

/** Where a friend gets the app: the test server's invite page in test builds, else Play. */
export function appLink(): string {
  return env.testServer ? getServerOrigin() ?? "" : PLAY_STORE_URL;
}

/** Opens the share sheet with a link friends can join from: the invite page in test builds. */
export async function inviteFriends(): Promise<void> {
  const link = appLink();
  await Share.share({
    message: `Join me on Paire, the dating app where AI finds people you'll actually click with. ${link}`.trim()
  });
}
