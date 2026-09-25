import { CALL_DOMAIN } from "../config/call";

const slugifyRoom = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

export const createRoomId = (seed?: string) => {
  if (seed) {
    return `muse-${slugifyRoom(seed)}`.slice(0, 64);
  }
  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `muse-${timestamp}-${random}`;
};

export const buildCallUrl = (roomId: string, displayName: string, videoEnabled: boolean) => {
  const safeRoom = slugifyRoom(roomId);
  const nameParam = encodeURIComponent(displayName || "Muse");
  const startWithVideoMuted = videoEnabled ? "false" : "true";
  const startWithAudioMuted = "false";
  const disableVideo = videoEnabled ? "false" : "true";
  return `https://${CALL_DOMAIN}/${safeRoom}#userInfo.displayName=${nameParam}&config.disableDeepLinking=true&config.startWithVideoMuted=${startWithVideoMuted}&config.startWithAudioMuted=${startWithAudioMuted}&config.disableVideo=${disableVideo}`;
};
