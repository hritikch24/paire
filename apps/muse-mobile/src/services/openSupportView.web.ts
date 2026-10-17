import { callFunction } from "./firebase";
import type { SupportDetails } from "./supportMode";

/** Transfer the credential only to the tab we opened, never through a URL or browser storage. */
export async function openSupportView(uid: string, reason: string): Promise<void> {
  const child = window.open(`${window.location.pathname}?support=1`, "_blank");
  if (!child) throw new Error("Allow pop-ups for Paire to open the support tab.");
  let receive: (event: MessageEvent) => void;
  let timer: ReturnType<typeof setTimeout>;
  const ready = new Promise<void>((resolve, reject) => {
    receive = (event) => {
      if (event.origin === window.location.origin && event.source === child && event.data?.type === "paire-support-ready") resolve();
    };
    window.addEventListener("message", receive);
    timer = setTimeout(() => reject(new Error("The support tab did not open. Please try again.")), 45_000);
  });
  let session: (SupportDetails & { token: string }) | undefined;
  try {
    // Wait for the app to be ready before issuing a credential, so popup failures create no sessions.
    await ready;
    if (child.closed) throw new Error("The support tab was closed.");
    session = await callFunction<SupportDetails & { token: string }>("adminStartSupportSession", { uid, reason });
    if (child.closed) throw new Error("The support tab was closed.");
    child.postMessage({ type: "paire-support-start", session }, window.location.origin);
  } catch (error) {
    child.close();
    if (session) await callFunction("adminEndSupportSession", { sessionId: session.sessionId }).catch(() => undefined);
    throw error;
  } finally {
    window.removeEventListener("message", receive!);
    clearTimeout(timer!);
  }
}
