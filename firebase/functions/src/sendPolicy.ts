import { onCall } from "firebase-functions/v2/https";
import { chatPolicy } from "./chatEntitlement";
import { REGION } from "./config";
import { requireReadAuth } from "./lib/auth";

export type SendPolicyStatus = { acceptFlow: boolean; womenSendFree: boolean; giftSales: boolean; freeSender: boolean };

export const getSendPolicy = onCall({ region: REGION, timeoutSeconds: 30 }, async (request): Promise<SendPolicyStatus> => {
  await requireReadAuth(request);
  const policy = await chatPolicy();
  return { acceptFlow: policy.acceptFlow, womenSendFree: false, giftSales: policy.giftSales, freeSender: false };
});
