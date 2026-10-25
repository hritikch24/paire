import React from "react";
import renderer, { act } from "react-test-renderer";
import { Chip } from "../src/components/Chip";
import { GENDER_LOCKED_NOTE, GenderPicker } from "../src/components/GenderPicker";

jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));

function render(locked: boolean, onChange = jest.fn()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<GenderPicker value="woman" onChange={onChange} locked={locked} />); });
  return { tree, onChange };
}

describe("gender choice while free sending for women is on", () => {
  it("is read-only with one plain sentence when locked", () => {
    const { tree, onChange } = render(true);
    const chips = tree.root.findAllByType(Chip);
    expect(chips.length).toBeGreaterThan(1);
    expect(chips.every((chip) => chip.props.disabled === true)).toBe(true);
    expect(tree.root.findByProps({ testID: "gender-locked-note" }).props.children).toBe("Contact support to change this.");
    expect(GENDER_LOCKED_NOTE).toBe("Contact support to change this.");
    expect(onChange).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("is unchanged otherwise: choosable, no note", () => {
    const { tree } = render(false);
    expect(tree.root.findAllByType(Chip).every((chip) => !chip.props.disabled)).toBe(true);
    expect(tree.root.findAllByProps({ testID: "gender-locked-note" })).toHaveLength(0);
    act(() => tree.unmount());
  });
});
