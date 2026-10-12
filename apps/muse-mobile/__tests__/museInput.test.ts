jest.mock("tamagui", () => ({
  Input: "Input",
  Text: "Text",
  XStack: "XStack",
  YStack: "YStack",
  styled: (component: unknown) => component
}));
jest.mock("../src/components/IconButton", () => ({ IconButton: "IconButton" }));

import { inputTypeFor } from "../src/components/MuseInput";

describe("inputTypeFor", () => {
  it("masks password fields (Tamagui ignores secureTextEntry otherwise)", () => {
    expect(inputTypeFor({ secureTextEntry: true })).toBe("password");
    expect(inputTypeFor({ secureTextEntry: true, keyboardType: "email-address" })).toBe("password");
  });

  it("keeps the right keyboard for email, numbers and phone numbers", () => {
    expect(inputTypeFor({ keyboardType: "email-address" })).toBe("email");
    expect(inputTypeFor({ keyboardType: "number-pad" })).toBe("number");
    expect(inputTypeFor({ keyboardType: "numeric" })).toBe("number");
    expect(inputTypeFor({ keyboardType: "phone-pad" })).toBe("tel");
    expect(inputTypeFor({ keyboardType: "url" })).toBe("url");
  });

  it("leaves ordinary text fields alone", () => {
    expect(inputTypeFor({})).toBeUndefined();
    expect(inputTypeFor({ secureTextEntry: false, keyboardType: "default" })).toBeUndefined();
  });
});
