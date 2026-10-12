import { useEffect, useRef } from "react";
import { useTheme } from "tamagui";
import type { ActionSheetOption } from "./ActionSheet";
export type { ActionSheetOption } from "./ActionSheet";

export function ActionSheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: ActionSheetOption[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const theme = useTheme();
  useEffect(() => {
    const dialog = ref.current;
    if (visible && !dialog?.open) dialog?.showModal();
    if (!visible && dialog?.open) dialog.close();
  }, [visible]);
  return <dialog ref={ref} aria-label={title || "Actions"} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }} style={{ position: "fixed", inset: "auto 0 0", margin: "0 auto", width: "min(520px,100%)", maxWidth: "100%", padding: 0, border: 0, borderRadius: "24px 24px 0 0", background: theme.backgroundStrong?.val, color: theme.text?.val, fontFamily: "inherit" }}>
    {title ? <p style={{ fontSize: 13, textAlign: "center", padding: "16px 20px 0" }}>{title}</p> : null}
    {options.map(option => <button key={option.label} data-testid={option.testID} onClick={() => { onClose(); option.onPress(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "20px 24px", border: 0, borderBottom: `1px solid ${theme.border?.val}`, background: "transparent", color: option.destructive ? theme.error?.val : theme.text?.val, fontFamily: "inherit", fontSize: 17, cursor: "pointer" }}>{option.label}</button>)}
    <button onClick={onClose} style={{ display: "block", width: "100%", padding: 20, border: 0, background: "transparent", color: theme.textMuted?.val, fontFamily: "inherit", fontSize: 17, cursor: "pointer" }}>Cancel</button>
  </dialog>;
}
