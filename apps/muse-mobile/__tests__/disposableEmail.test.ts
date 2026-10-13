import { isDisposableEmail } from "../src/utils/disposableEmail";

describe("throwaway email warning", () => {
  test("flags temporary inboxes, not real providers", () => {
    expect(isDisposableEmail("me@yopmail.com")).toBe(true);
    expect(isDisposableEmail("me@x.guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("me@gmail.com")).toBe(false);
    expect(isDisposableEmail("me@outlook.in")).toBe(false);
    expect(isDisposableEmail("")).toBe(false);
  });
});
