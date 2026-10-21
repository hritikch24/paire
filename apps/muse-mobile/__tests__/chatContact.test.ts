import examples from "./fixtures/chatContact.json";
import { chatContactIssue } from "../src/utils/chatContact";

describe("contact details before sending", () => {
  test.each(examples.blocked)("blocks contact details: %s", text => {
    expect(chatContactIssue(text)?.message).toMatch(/choose Share contact details/);
  });
  test.each(examples.allowed)("allows ordinary conversation: %s", text => {
    expect(chatContactIssue(text)).toBeNull();
  });
  test("allows a corrected message immediately without retaining a blocked state", () => {
    expect(chatContactIssue("IG: alex")).not.toBeNull();
    expect(chatContactIssue("Let's keep chatting here")).toBeNull();
  });
});
