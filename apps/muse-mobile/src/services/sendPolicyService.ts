import { callFunction } from "./firebase";

/**
 * The accept-flow and free-sending switches as the server sees them
 * (getSendPolicy). `freeSender` is effective: the switch is on AND the caller
 * is a woman. The app only displays this; the Firestore rules enforce it.
 */
export type SendPolicy = {
  acceptFlow: boolean;
  womenSendFree: boolean;
  giftSales: boolean;
  freeSender: boolean;
};

export const fetchSendPolicy = () => callFunction<SendPolicy>("getSendPolicy", {});
