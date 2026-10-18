import { useEffect, useRef, useState } from "react";
import { useTheme } from "tamagui";
import { Icon, type IconName } from "./Icon";

export type DiscoveryActionsProps = { undoDisabled: boolean; onUndo: () => void; onPass: () => void; onSuper: () => void; onNote: () => void; onLike: () => void };

/** Holding the heart this long turns the like into a Super Like. */
const HOLD_MS = 700;

/**
 * Tap the heart to like. Press and hold it: a ring fills around the heart and,
 * when it's full, the like becomes a Super Like (letting go early is a plain like).
 */
function useHoldToSuper(onLike: () => void, onSuper: () => void) {
  const [charge, setCharge] = useState(0);
  const [burst, setBurst] = useState(0);
  const hold = useRef<{ start: number; frame: number; fired: boolean } | null>(null);
  const stop = () => {
    if (hold.current) cancelAnimationFrame(hold.current.frame);
    setCharge(0);
  };
  useEffect(() => () => { if (hold.current) cancelAnimationFrame(hold.current.frame); }, []);
  const begin = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const state = { start: performance.now(), frame: 0, fired: false };
    hold.current = state;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - state.start) / HOLD_MS);
      setCharge(progress);
      if (progress < 1) {
        state.frame = requestAnimationFrame(tick);
        return;
      }
      state.fired = true;
      setCharge(0);
      setBurst((count) => count + 1);
      navigator.vibrate?.(35);
      onSuper();
    };
    state.frame = requestAnimationFrame(tick);
  };
  // A click follows the pointer-up: it's the like, unless the hold already sent a Super Like.
  const click = () => {
    const fired = hold.current?.fired === true;
    hold.current = null;
    if (!fired) onLike();
  };
  return { charge, burst, begin, end: stop, click };
}

export function DiscoveryActions({ undoDisabled, onUndo, onPass, onSuper, onNote, onLike }: DiscoveryActionsProps) {
  const theme = useTheme();
  const heart = useHoldToSuper(onLike, onSuper);
  const superColor = theme.superLike?.val ?? "#4f6bed";
  const actions: Array<{ id: string; label: string; spoken: string; icon: IconName; onClick: () => void; color: string; main?: boolean; filled?: boolean; disabled?: boolean }> = [
    { id: "undo", label: "Undo", spoken: "Undo last pass", icon: "arrow-undo", onClick: onUndo, color: theme.textMuted?.val, disabled: undoDisabled },
    { id: "nope", label: "Pass", spoken: "Pass", icon: "close", onClick: onPass, color: theme.nope?.val, main: true },
    { id: "super", label: "Super", spoken: "Super Like", icon: "star", onClick: onSuper, color: theme.superLike?.val },
    { id: "spark", label: "Note", spoken: "Like with a note", icon: "chatbubble-ellipses", onClick: onNote, color: theme.primary?.val },
    { id: "like", label: "Like", spoken: "Like. Press and hold for a Super Like", icon: "heart", onClick: heart.click, color: theme.primaryForeground?.val, main: true, filled: true }
  ];
  return <div data-testid="discover-actions" style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", padding: "8px 12px 0", flexShrink: 0 }}>
    <style>{`
      .paire-discover-action { -webkit-tap-highlight-color: transparent; transition: transform .16s ease, opacity .16s ease; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
      .paire-discover-action:not(:disabled):active { transform: scale(.94); }
      @media (hover:hover) { .paire-discover-action:not(:disabled):hover { transform: translateY(-2px); } }
      @keyframes paire-super-burst { 0% { transform: translate(-50%, -50%) scale(.4); opacity: 1; } 100% { transform: translate(-50%, -160%) scale(1.6); opacity: 0; } }
      @keyframes paire-super-ring { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(1.8); opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .paire-super-fx { animation: none !important; display: none; } }
    `}</style>
    {actions.map((action) => {
      const isLike = action.id === "like";
      const size = action.main ? 56 : 44;
      return <button key={action.id} type="button" className="paire-discover-action" data-testid={`discover-${action.id}`} aria-label={action.spoken} title={isLike ? "Tap to like · hold for a Super Like" : undefined} disabled={action.disabled} onClick={action.onClick}
        onPointerDown={isLike ? heart.begin : undefined} onPointerUp={isLike ? heart.end : undefined} onPointerLeave={isLike ? heart.end : undefined} onPointerCancel={isLike ? heart.end : undefined}
        onContextMenu={isLike ? (event) => event.preventDefault() : undefined}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, position: "relative",
          padding: 0, border: 0, background: "transparent", cursor: action.disabled ? "default" : "pointer", opacity: action.disabled ? .35 : 1,
          color: theme.textMuted?.val, minWidth: action.main ? 56 : 44, minHeight: 76, font: "inherit", flexShrink: 0
        }}>
        <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: action.filled ? theme.primary?.val : theme.backgroundStrong?.val, border: `1px solid ${action.filled ? "transparent" : theme.border?.val}`, boxShadow: action.main ? "0 3px 12px #35101d0d" : "none", transform: isLike && heart.charge > 0 ? `scale(${1 + heart.charge * 0.12})` : undefined }}>
          {isLike && heart.charge > 0.08 ? <span aria-hidden="true" data-testid="discover-like-charge" style={{ position: "absolute", inset: -5, borderRadius: "50%", background: `conic-gradient(${superColor} ${heart.charge * 360}deg, transparent 0deg)`, WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))", mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))" }} /> : null}
          {isLike && heart.burst ? <span key={heart.burst} aria-hidden="true">
            <span className="paire-super-fx" style={{ position: "absolute", inset: -2, borderRadius: "50%", border: `3px solid ${superColor}`, animation: "paire-super-ring .6s ease-out forwards" }} />
            {[-28, 0, 28].map((offset, index) => <span key={offset} className="paire-super-fx" style={{ position: "absolute", left: `calc(50% + ${offset}px)`, top: 0, fontSize: 16 + index * 2, color: superColor, animation: `paire-super-burst .7s ${index * 60}ms ease-out forwards` }}>★</span>)}
          </span> : null}
          <Icon name={isLike && heart.charge > 0.5 ? "star" : action.icon} size={action.main ? 28 : 21} color={action.color} />
        </span>
        <span style={{ fontSize: 10, lineHeight: "14px", fontWeight: 600 }}>{isLike && heart.charge > 0.08 ? "Hold…" : action.label}</span>
      </button>;
    })}
  </div>;
}
