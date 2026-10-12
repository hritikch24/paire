import type { AlertButton, AlertOptions } from "react-native";

/** Native Alert has no browser implementation. Use a keyboard-accessible dialog. */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    const dialog = document.createElement("dialog");
    const heading = document.createElement("h2");
    const text = document.createElement("p");
    const actions = document.createElement("div");
    const id = `muse-dialog-${Date.now()}`;
    heading.id = id;
    heading.textContent = title;
    text.textContent = message ?? "";
    dialog.setAttribute("aria-labelledby", id);
    dialog.style.cssText = "border:1px solid #e5d9dd;border-radius:22px;padding:24px;background:#fbf8f6;color:#261e25;max-width:min(400px,calc(100vw - 32px));box-sizing:border-box;font-family:system-ui;box-shadow:0 24px 80px #0003";
    heading.style.cssText = "font-size:20px;margin:0 0 12px;line-height:1.3";
    text.style.cssText = "font-size:14px;line-height:1.6";
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:20px";
    const previous = document.activeElement;
    const dismiss = () => { dialog.close(); dialog.remove(); if (previous instanceof HTMLElement) previous.focus(); };
    for (const choice of buttons?.length ? buttons : [{ text: "OK" }]) {
      const button = document.createElement("button");
      button.textContent = choice.text ?? "OK";
      button.style.cssText = `padding:12px 17px;border:1px solid #d8c5cd;border-radius:99px;cursor:pointer;font:inherit;font-size:13px;background:${choice.style === "destructive" ? "#a43754" : "#fff"};color:${choice.style === "destructive" ? "#fff" : "#302a2c"}`;
      button.onclick = () => { dismiss(); choice.onPress?.(); };
      actions.append(button);
    }
    dialog.addEventListener("cancel", (event) => {
      if (options?.cancelable === false) { event.preventDefault(); return; }
      event.preventDefault(); dismiss(); options?.onDismiss?.();
    });
    dialog.append(heading, text, actions); document.body.append(dialog); dialog.showModal();
  }
};
