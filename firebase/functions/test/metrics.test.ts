import { deviceKey, istDay, isBot, pageKey, sourceKey } from "../src/lib/metrics";

describe("anonymous visit counting", () => {
  test("only known pages become keys", () => {
    expect(pageKey("/")).toBe("home");
    expect(pageKey("/app/chat/123")).toBe("app");
    expect(pageKey("/garba-nights")).toBe("garba-nights");
    expect(pageKey("/auth/action/?mode=x")).toBe("auth-action");
    expect(pageKey("/wp-admin.php")).toBe("other");
    expect(pageKey(42)).toBe("other");
  });

  test("sources: ad tags, known sites, other sites, direct", () => {
    expect(sourceKey({ utm: "Insta_Reel1" })).toBe("utm_insta_reel1");
    expect(sourceKey({ utm: "bad value!", fbclid: "x" })).toBe("facebook-ad");
    expect(sourceKey({ referrer: "https://l.instagram.com/?u=x" })).toBe("instagram");
    expect(sourceKey({ referrer: "https://www.google.co.in/" })).toBe("google");
    expect(sourceKey({ referrer: "https://www.paire.in/garba-nights/" })).toBe("direct");
    expect(sourceKey({ referrer: "https://someblog.example/" })).toBe("other-sites");
    expect(sourceKey({})).toBe("direct");
  });

  test("bots are skipped and devices grouped; days are India's", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(false);
    expect(deviceKey("Mozilla/5.0 (Linux; Android 15) Mobile")).toBe("phone");
    expect(deviceKey("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)")).toBe("computer");
    expect(istDay(Date.parse("2026-10-13T19:00:00Z"))).toBe("2026-10-14");
  });
});
