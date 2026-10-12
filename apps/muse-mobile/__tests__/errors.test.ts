import { errorCode, friendlyError } from "../src/services/errors";

function firebaseError(code: string, message = `Firebase: Error (${code}).`) {
  return Object.assign(new Error(message), { code });
}

describe("friendlyError", () => {
  it("never shows raw Firebase auth errors", () => {
    const message = friendlyError(firebaseError("auth/invalid-credential"));
    expect(message).toMatch(/don't match/);
    expect(message).not.toMatch(/Firebase/);
  });

  it("explains common sign-up problems", () => {
    expect(friendlyError(firebaseError("auth/email-already-in-use"))).toMatch(/already uses this email/);
    expect(friendlyError(firebaseError("auth/network-request-failed"))).toMatch(/offline/);
  });

  it("passes through our own function messages", () => {
    const error = firebaseError("functions/resource-exhausted", "You're out of Super Likes for today.");
    expect(friendlyError(error)).toBe("You're out of Super Likes for today.");
  });

  it("hides internal server errors behind the fallback", () => {
    expect(friendlyError(firebaseError("functions/internal", "INTERNAL"), "Try again")).toBe("Try again");
    expect(friendlyError(new Error("something odd"), "Try again")).toBe("Try again");
    expect(friendlyError("not an error", "Try again")).toBe("Try again");
  });

  it("reads error codes safely", () => {
    expect(errorCode(firebaseError("permission-denied"))).toBe("permission-denied");
    expect(errorCode(null)).toBeUndefined();
  });
});
