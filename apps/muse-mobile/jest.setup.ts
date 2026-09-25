// Minimal globals for snapshot tests running in node.
const testWindow: any =
  typeof window === "undefined" ? ((globalThis as any).window = {}) : window;
testWindow.dispatchEvent = testWindow.dispatchEvent ?? (() => {});
testWindow.addEventListener = testWindow.addEventListener ?? (() => {});
testWindow.removeEventListener = testWindow.removeEventListener ?? (() => {});
