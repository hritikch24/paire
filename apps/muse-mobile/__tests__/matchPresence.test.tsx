import React from "react";
import renderer, { act } from "react-test-renderer";
import { MatchPresenceDot, matchPresence } from "../src/components/MatchPresence";

jest.mock("tamagui", () => ({ YStack: "YStack" }));

test.each([
  [{ online: true } as const, "Online", "$success", "online"],
  [{ online: false, lastActiveAt: null } as const, "Offline", "$error", "offline"],
  [null, "Status unavailable", "$textMuted", "unknown"]
] as const)("presence %j has a clear label and dot colour", (status, label, color, state) => {
  expect(matchPresence(status)).toMatchObject({ label, color, state });
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MatchPresenceDot status={status} size={58} />); });
  expect(tree.root.findByProps({ testID: `presence-dot-${state}` }).props.backgroundColor).toBe(color);
  act(() => tree.unmount());
});
