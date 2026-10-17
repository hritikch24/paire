import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "../services/authSdk";
import { auth, callFunction } from "../services/firebase";
import { queryClient } from "../services/queryClient";
import { isSupportView, supportContext, type SupportDetails } from "../services/supportMode";

export function SupportSessionBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"waiting" | "active" | "ended">("waiting");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!isSupportView) return;
    let disposed = false;
    let received = false;
    const opener = window.opener;
    const receive = async (event: MessageEvent) => {
      if (received || event.origin !== window.location.origin || event.source !== opener || event.data?.type !== "paire-support-start") return;
      received = true;
      clearInterval(announce);
      clearTimeout(timeout);
      const session = event.data.session as SupportDetails & { token: string };
      if (!session || typeof session.token !== "string" || typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
        setError("This support session is invalid or expired. Open a new one from Member admin.");
        setState("ended");
        return;
      }
      const { token, ...details } = session;
      try {
        supportContext.current = details;
        await signInWithCustomToken(auth, token);
        if (!disposed) { setRemaining(Math.ceil((details.expiresAt - Date.now()) / 1000)); setState("active"); }
      } catch {
        if (!disposed) { setError("Couldn't start support access. Return to Member admin and try again."); setState("ended"); }
      }
      window.opener = null;
    };
    window.addEventListener("message", receive);
    const announce = setInterval(() => opener?.postMessage({ type: "paire-support-ready" }, window.location.origin), 500);
    const timeout = setTimeout(() => {
      if (!received && !disposed) { setError("This tab has no support session. Open a new one from Member admin."); setState("ended"); }
    }, opener ? 50_000 : 0);
    return () => { disposed = true; window.removeEventListener("message", receive); clearInterval(announce); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!isSupportView || state !== "active") return;
    let finishing = false;
    const check = async () => {
      if (finishing) return;
      const seconds = Math.max(0, Math.ceil(((supportContext.current?.expiresAt ?? 0) - Date.now()) / 1000));
      setRemaining(seconds);
      try {
        if (!seconds) throw new Error("expired");
        await callFunction("getSupportSessionState");
      } catch {
        finishing = true;
        setState("ended");
        setError("Support access has ended or the connection was lost. Return to Member admin to open a new session.");
        await signOut(auth).catch(() => undefined);
        queryClient.clear();
      }
    };
    // Re-check expiry on foreground too; sleeping tabs cannot keep cached private data on screen.
    const tick = setInterval(() => {
      const seconds = Math.max(0, Math.ceil(((supportContext.current?.expiresAt ?? 0) - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) void check();
    }, 1000);
    const poll = setInterval(() => void check(), 15_000);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== `support_${supportContext.current?.sessionId}`) {
        finishing = true;
        setState("ended");
        setError("Support access ended.");
        queryClient.clear();
      }
    });
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => { unsubscribe(); clearInterval(tick); clearInterval(poll); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [state]);

  if (!isSupportView) return <>{children}</>;
  const exit = async () => {
    setState("ended");
    setError("Support access ended.");
    try { await callFunction("adminEndSupportSession"); } catch { /* The server expiry remains authoritative when offline. */ }
    await signOut(auth).catch(() => undefined);
    queryClient.clear();
  };
  if (state !== "active") return <div role="status" style={{ padding: 24, lineHeight: 1.6 }}>
    <h2>{state === "waiting" ? "Opening support session…" : "Support session ended"}</h2>
    <p>{error}</p>
    <a href={window.location.pathname}>Return to admin account</a>
  </div>;
  return <>
    <div role="status" data-testid="support-banner" style={{ background: "#fff0c2", color: "#362800", padding: 12, font: "14px system-ui", flexShrink: 0 }}>
      <strong>Viewing {supportContext.current?.name} · Read-only</strong><br />
      {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} remaining. Profile, settings and chats can be inspected. Changes are blocked.
      <button type="button" onClick={() => void exit()} style={{ display: "block", marginTop: 8, padding: "8px 12px", cursor: "pointer" }}>Exit support session</button>
    </div>
    {children}
  </>;
}
