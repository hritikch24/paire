import { authEmail, paireActionLink } from "../src/lib/authEmail";

describe("Paire account emails", () => {
  test("moves Firebase's one-time code onto Paire's own page", () => {
    const link = paireActionLink("https://muse-352ba.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC-123_x&apiKey=KEY&lang=en", "https://www.paire.in");
    expect(link).toBe("https://www.paire.in/auth/action/?mode=resetPassword&oobCode=ABC-123_x&apiKey=KEY");
    expect(paireActionLink("https://muse-352ba.firebaseapp.com/__/auth/action?mode=signIn&oobCode=x")).toBeNull();
    expect(paireActionLink("https://muse-352ba.firebaseapp.com/__/auth/action?mode=verifyEmail")).toBeNull();
    expect(paireActionLink("not a url")).toBeNull();
  });

  test("emails carry the link in both the button and plain text, escaped", () => {
    const email = authEmail("verify", "https://www.paire.in/auth/action/?mode=verifyEmail&oobCode=a&apiKey=b");
    expect(email.subject).toBe("Confirm your email for Paire");
    expect(email.html).toContain('href="https://www.paire.in/auth/action/?mode=verifyEmail&amp;oobCode=a&amp;apiKey=b"');
    expect(email.text).toContain("https://www.paire.in/auth/action/?mode=verifyEmail&oobCode=a&apiKey=b");
    expect(authEmail("reset", "https://www.paire.in/x").subject).toBe("Reset your Paire password");
  });
});
