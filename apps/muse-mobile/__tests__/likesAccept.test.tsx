import React from "react";
import renderer, { act } from "react-test-renderer";
import { LikesYouRow } from "../src/components/LikesYouRow";
import type { DiscoverProfile } from "../src/types/models";

jest.mock("react-native", () => ({ Pressable: "Pressable", ScrollView: "ScrollView" }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("../src/components/Avatar", () => ({ Avatar: () => null }));
jest.mock("../src/components/Icon", () => ({ Icon: () => null }));
jest.mock("../src/components/LockedLikes", () => ({ LockedLikes: "LockedLikes" }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton", GhostButton: "GhostButton" }));

const him = { uid: "him", displayName: "Arjun", age: 29, photoUrls: [], compatibility: 80 } as unknown as DiscoverProfile;
const base = { profiles: [him], count: 1, locked: false, onUpgrade: jest.fn(), onOpen: jest.fn() };
const ofType = (tree: renderer.ReactTestRenderer, name: string) => tree.root.findAll((node) => (node.type as unknown) === name);
const mount = (props: Partial<React.ComponentProps<typeof LikesYouRow>>) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<LikesYouRow {...base} {...props} />); });
  return tree;
};
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAll((n) => typeof n.type === "string" && typeof n.props.children === "string").map((n) => n.props.children);

test("with acceptable each person has Accept and Not now, wired to the answers, and no lock panel", () => {
  const onAccept = jest.fn(), onNotNow = jest.fn();
  const tree = mount({ acceptable: true, onAccept, onNotNow });
  expect(texts(tree)).toEqual(expect.arrayContaining(["Accept", "Not now"]));
  expect(ofType(tree, "LockedLikes")).toHaveLength(0);
  act(() => tree.root.findByProps({ testID: "liked-you-accept-him" }).props.onPress());
  act(() => tree.root.findByProps({ testID: "liked-you-notnow-him" }).props.onPress());
  expect(onAccept).toHaveBeenCalledWith(him);
  expect(onNotNow).toHaveBeenCalledWith(him);
});

test("both buttons are disabled while an answer is pending", () => {
  const tree = mount({ acceptable: true, onAccept: jest.fn(), onNotNow: jest.fn(), pendingUid: "him" });
  expect(tree.root.findByProps({ testID: "liked-you-accept-him" }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ testID: "liked-you-notnow-him" }).props.disabled).toBe(true);
});

test("when not acceptable the row is exactly as before: no Accept, and the lock panel for a free member", () => {
  const plus = mount({ acceptable: false });
  expect(texts(plus)).not.toContain("Accept");
  expect(plus.root.findAllByProps({ testID: "liked-you-accept-him" })).toHaveLength(0);
  expect(ofType(mount({ locked: true, acceptable: false }), "LockedLikes")).toHaveLength(1);
  expect(ofType(mount({ locked: true }), "LockedLikes")).toHaveLength(1);
});
