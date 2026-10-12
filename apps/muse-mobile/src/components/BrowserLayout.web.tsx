import type { ReactNode } from "react";
import { useTheme } from "tamagui";

export function BrowserLayout({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <div className="muse-browser" style={{ background: theme.background?.val, color: theme.text?.val }}>
    <style>{`
      html,body,#root {height:100%;margin:0} body {overflow:hidden}
      .muse-browser {height:100dvh;display:flex;justify-content:center;font-family:SpaceGrotesk_400Regular,system-ui,sans-serif}
      .muse-side {width:330px;padding:48px 52px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}
      .muse-side a {color:inherit;text-decoration:none}.muse-side a:focus-visible {outline:2px solid #a52d55;outline-offset:6px}
      .muse-word {font-size:42px;font-weight:700;letter-spacing:-3px}.muse-side h1 {font-size:48px;line-height:1.05;letter-spacing:-2px;margin:32px 0 24px}
      .muse-side p {font-size:15px;line-height:1.7;opacity:.7}.muse-side small {font-size:12px;line-height:1.6;opacity:.7}
      .muse-app-panel {display:flex;flex-direction:column;width:min(520px,100%);height:100%;position:relative;box-shadow:0 0 0 1px #8882;overflow:hidden}
      @media(max-width:900px){.muse-side{display:none}}
    `}</style>
    <aside className="muse-side" aria-label="About Paire">
      <a href="/" className="muse-word" aria-label="Paire home">paire<span style={{ color: "#B83A5E" }}>.</span></a>
      <div><small>MEN &amp; WOMEN · 18+ · DELHI NCR FIRST</small><h1>Every love<br/>story starts<br/>with a <span style={{ color: "#B83A5E" }}>note.</span></h1><p>Women set the rules.<br/>Men get a fair chance.</p><p>See who likes you, chat and every privacy control: free.</p></div>
      <div><a href="/safety/">Safety & community ↗</a><p>Beta · Made in India</p><small>Paire Plus passes from ₹20. No auto-renewal, ever.</small></div>
    </aside>
    <main className="muse-app-panel" aria-label="Paire dating app">{children}</main>
  </div>;
}
