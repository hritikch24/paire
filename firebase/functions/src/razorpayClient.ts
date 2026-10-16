import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";

const RAZORPAY_API = "https://api.razorpay.com/v1";

function authHeader(): string {
  return `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
}

/** Authenticated Razorpay API call with the server's own key. Secrets never reach a client. */
export async function razorpay<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method: init?.method ?? "GET",
    headers: { authorization: authHeader(), "content-type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    logger.warn("Razorpay API error", { path: path.replace(/\/[a-z]+_[A-Za-z0-9]+/g, "/…"), status: response.status });
    throw new HttpsError("unavailable", "The payment service didn't respond. Please try again.");
  }
  return (await response.json()) as T;
}
