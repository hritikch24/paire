import { useEffect, useRef, useState } from "react";
import { useTheme } from "tamagui";
import type { DiscoverProfile } from "../types/models";

type Props = { profiles: DiscoverProfile[]; onPick: (profile: DiscoverProfile) => void };

/** Fewer than this and there's nothing to spin. */
const MIN_PROFILES = 2;

/**
 * "Feeling lucky?": a slot-machine spin through the loaded deck that lands on
 * one person and brings their card to the top. Names and ages only, never
 * photos (some members keep theirs private until a match). Nothing is sent:
 * it only reorders the cards you already have.
 */
export function LuckySpin({ profiles, onPick }: Props) {
  const theme = useTheme();
  const [spinning, setSpinning] = useState<{ shown: DiscoverProfile; landed: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  if (profiles.length < MIN_PROFILES) return null;

  const spin = () => {
    if (spinning) return;
    const pool = profiles.slice(0, 15);
    const winner = pool[Math.floor(Math.random() * pool.length)];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Each step a little slower, like a wheel running down.
    const delays = reduced ? [0] : Array.from({ length: 16 }, (_, index) => 60 + index * index * 2.4);
    let elapsed = 0;
    delays.forEach((delay, index) => {
      elapsed += delay;
      timers.current.push(window.setTimeout(() => {
        const last = index === delays.length - 1;
        setSpinning({ shown: last ? winner : pool[(index + 1) % pool.length], landed: last });
        if (last) {
          navigator.vibrate?.([20, 40, 20]);
          timers.current.push(window.setTimeout(() => { setSpinning(null); onPick(winner); }, reduced ? 600 : 1300));
        }
      }, elapsed));
    });
    setSpinning({ shown: pool[0], landed: false });
  };

  const rose = theme.primary?.val ?? "#b83a5e";
  return <>
    <button type="button" data-testid="discover-lucky" onClick={spin} aria-label="Feeling lucky? Spin to pick someone from your cards" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 4px", border: 0, background: "transparent", color: rose, font: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
      <span aria-hidden="true" style={{ fontSize: 16 }}>🎲</span>Lucky spin
    </button>
    {spinning ? <div role="dialog" aria-modal="true" aria-label="Lucky spin" data-testid="lucky-overlay" style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "#2a0d1fcc", backdropFilter: "blur(6px)" }}>
      <style>{`@keyframes paire-lucky-pop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}@keyframes paire-lucky-tick{0%{transform:translateY(-10px);opacity:.3}100%{transform:none;opacity:1}}`}</style>
      <div aria-live="assertive" style={{ width: "min(320px, calc(100vw - 48px))", borderRadius: 28, padding: "28px 24px", textAlign: "center", background: theme.background?.val ?? "#fff", boxShadow: "0 24px 60px #0006", animation: "paire-lucky-pop .35s ease-out" }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700, color: rose }}>{spinning.landed ? "YOUR LUCKY PICK" : "SPINNING…"}</div>
        <div aria-hidden="true" style={{ fontSize: 44, margin: "10px 0 6px" }}>{spinning.landed ? "✨" : "🎲"}</div>
        <div key={spinning.shown.uid + String(spinning.landed)} data-testid="lucky-name" style={{ fontSize: 30, fontWeight: 700, color: theme.color?.val, animation: spinning.landed ? "paire-lucky-pop .4s ease-out" : "paire-lucky-tick .08s linear" }}>
          {spinning.shown.displayName}, {spinning.shown.age}
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: theme.textMuted?.val }}>{spinning.landed ? "Their card is up next. Like them, or spin again." : "Who will it be?"}</div>
      </div>
    </div> : null}
  </>;
}
