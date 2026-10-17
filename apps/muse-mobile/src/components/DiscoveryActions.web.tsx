import { useTheme } from "tamagui";
import { Icon, type IconName } from "./Icon";

export type DiscoveryActionsProps = { undoDisabled: boolean; onUndo: () => void; onPass: () => void; onSuper: () => void; onNote: () => void; onLike: () => void };

export function DiscoveryActions({ undoDisabled, onUndo, onPass, onSuper, onNote, onLike }: DiscoveryActionsProps) {
  const theme = useTheme();
  const actions: Array<{ id: string; label: string; spoken: string; icon: IconName; onClick: () => void; color: string; main?: boolean; filled?: boolean; disabled?: boolean }> = [
    { id: "undo", label: "Undo", spoken: "Undo last pass", icon: "arrow-undo", onClick: onUndo, color: theme.textMuted?.val, disabled: undoDisabled },
    { id: "nope", label: "Pass", spoken: "Pass", icon: "close", onClick: onPass, color: theme.nope?.val, main: true },
    { id: "super", label: "Super", spoken: "Super Like", icon: "star", onClick: onSuper, color: theme.superLike?.val },
    { id: "spark", label: "Note", spoken: "Like with a note", icon: "chatbubble-ellipses", onClick: onNote, color: theme.primary?.val },
    { id: "like", label: "Like", spoken: "Like", icon: "heart", onClick: onLike, color: theme.primaryForeground?.val, main: true, filled: true }
  ];
  return <div data-testid="discover-actions" style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", padding: "8px 12px 0", flexShrink: 0 }}>
    <style>{`
      .paire-discover-action { -webkit-tap-highlight-color: transparent; transition: transform .16s ease, opacity .16s ease; }
      .paire-discover-action:not(:disabled):active { transform: scale(.94); }
      @media (hover:hover) { .paire-discover-action:not(:disabled):hover { transform: translateY(-2px); } }
    `}</style>
    {actions.map((action) => <button key={action.id} type="button" className="paire-discover-action" data-testid={`discover-${action.id}`} aria-label={action.spoken} disabled={action.disabled} onClick={action.onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
      padding: 0, border: 0, background: "transparent", cursor: action.disabled ? "default" : "pointer", opacity: action.disabled ? .35 : 1,
      color: theme.textMuted?.val, minWidth: action.main ? 56 : 44, minHeight: 76, font: "inherit", flexShrink: 0
    }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: action.main ? 56 : 44, height: action.main ? 56 : 44, borderRadius: "50%", background: action.filled ? theme.primary?.val : theme.backgroundStrong?.val, border: `1px solid ${action.filled ? "transparent" : theme.border?.val}`, boxShadow: action.main ? "0 3px 12px #35101d0d" : "none" }}>
        <Icon name={action.icon} size={action.main ? 28 : 21} color={action.color} />
      </span>
      <span style={{ fontSize: 10, lineHeight: "14px", fontWeight: 600 }}>{action.label}</span>
    </button>)}
  </div>;
}
