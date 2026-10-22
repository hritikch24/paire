import { PREMIUM_PLANS } from "../config/premium";
import type { ReactNode } from "react";
import { useTheme } from "tamagui";

/** Browser chrome follows the member's selected theme inside the app panel. */
export function BrowserLayout({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <div className="muse-browser" style={{ color: theme.text?.val }}>
    <style>{`
      html,body,#root{height:100%;margin:0}body{overflow:hidden}
      .muse-browser{height:100dvh;display:flex;align-items:center;justify-content:center;gap:28px;background:radial-gradient(ellipse at 12% 10%,#53365060,transparent 55%),radial-gradient(ellipse at 95% 85%,#4e3e6650,transparent 50%),#111018;font-family:SpaceGrotesk_400Regular,system-ui,sans-serif}
      .muse-side{width:330px;align-self:stretch;padding:42px 30px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;color:#f7f0fb;position:relative;isolation:isolate}
      .muse-side a{color:inherit;text-decoration:none}.muse-side a:focus-visible{outline:3px solid #ffb1d0;outline-offset:5px}.muse-word{font-size:39px;font-weight:700;letter-spacing:-2.5px}.muse-word span{color:#ffb1d0}
      .muse-side h1{font-size:43px;line-height:1.09;letter-spacing:-2.1px;font-weight:500;margin:22px 0}.muse-side h1 span{color:#ffb1d0}.muse-side p{font-size:13px;line-height:1.85;color:#bdb5cc}.muse-side small{font-size:9px;line-height:1.8;letter-spacing:1.5px;color:#bdb5cc}.muse-side .lab-link{display:block;padding:15px 16px;border:1px solid #ffffff22;border-radius:18px;background:#ffffff06;margin-top:22px}.lab-link b{display:block;font-size:13px;color:#ffb1d0;margin-bottom:4px}.lab-link span{font-size:11px;line-height:1.7;color:#bdb5cc}.muse-side-bottom a{font-size:11px;color:#e5d3e9}.muse-side-bottom p{font-size:10px;margin-bottom:7px}.muse-side-bottom small{letter-spacing:0;font-size:10px}
      .muse-orbit{height:140px;position:relative;margin:14px 0 25px;overflow:hidden;display:grid;place-items:center}.muse-orbit::before,.muse-orbit::after{content:'';position:absolute;width:115px;height:115px;border-radius:50%;border:1px solid #ffb1d065;left:calc(50% - 90px);top:10px;transform:rotate(-20deg)}.muse-orbit::after{left:calc(50% - 20px);border-color:#b9a5ff70}.muse-orbit span{font-size:47px;color:#ffb1d0;text-shadow:0 0 30px #ffb1d065}
      .muse-app-panel{display:flex;flex-direction:column;width:min(520px,100%);height:calc(100dvh - 40px);position:relative;box-sizing:border-box;border:1px solid #ffffff38;border-radius:26px;box-shadow:0 25px 90px #0005,0 0 65px #bb87a40a;overflow:hidden;background:${theme.background?.val}}
      @media(max-height:740px) and (min-width:901px){.muse-side{padding-top:25px;padding-bottom:25px}.muse-side h1{font-size:35px}.muse-orbit{height:95px;margin:5px 0}.muse-side .lab-link{margin-top:12px}}
      @media(max-width:900px){.muse-side{display:none}.muse-browser{gap:0}.muse-app-panel{height:100dvh;border:0;border-radius:0;box-shadow:none}}
    `}</style>
    <aside className="muse-side" aria-label="About Paire">
      <a href="/app/" className="muse-word" aria-label="Paire home">paire<span>.</span></a>
      <div><small>HUMAN CONNECTION / NEW POSSIBILITIES</small><h1>Your next<br/>chapter is<br/><span>unscripted.</span></h1><p>A note that starts something.<br/>Privacy on your terms.<br/>A little more possibility.</p><div className="muse-orbit" aria-hidden="true"><span>✳</span></div><a className="lab-link" href="/date-duet/"><b>New · Date Duet ↗</b><span>Two people. One first-date blueprint.<br/>Make your choices. Find common ground.</span></a></div>
      <div className="muse-side-bottom"><a href="/safety/">Your comfort comes first ↗</a><p>Adults 18+ · Built in India</p><small>{`Optional Plus passes from ₹${PREMIUM_PLANS[0].priceInr}. No auto-renewal.`}</small></div>
    </aside>
    <main className="muse-app-panel" aria-label="Paire dating app">{children}</main>
  </div>;
}
