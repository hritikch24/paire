import {
  isConnectLink,
  parseServerAddress,
  PLACEHOLDER_ORIGIN,
  rewriteToServer,
  serverLabel
} from "../src/utils/serverAddress";

describe("parseServerAddress", () => {
  it("reads invite links and bare addresses", () => {
    expect(parseServerAddress("https://calm-river-demo.trycloudflare.com")).toBe("https://calm-river-demo.trycloudflare.com");
    expect(parseServerAddress("  https://Calm-River-Demo.trycloudflare.com/#install ")).toBe(
      "https://calm-river-demo.trycloudflare.com"
    );
    expect(parseServerAddress("calm-river-demo.trycloudflare.com")).toBe("https://calm-river-demo.trycloudflare.com");
    expect(parseServerAddress("https://example.com:8443/path?x=1")).toBe("https://example.com:8443");
  });

  it("reads the app's connect links", () => {
    const link = `musetest://connect?server=${encodeURIComponent("https://calm-river-demo.trycloudflare.com")}`;
    expect(isConnectLink(link)).toBe(true);
    expect(parseServerAddress(link)).toBe("https://calm-river-demo.trycloudflare.com");
    expect(isConnectLink("musetest://chat/123")).toBe(false);
    expect(parseServerAddress("musetest://connect?other=1")).toBeNull();
  });

  it("allows plain http only on the local network", () => {
    expect(parseServerAddress("http://192.168.1.20:8787")).toBe("http://192.168.1.20:8787");
    expect(parseServerAddress("http://localhost:8787")).toBe("http://localhost:8787");
    expect(parseServerAddress("http://calm-river-demo.trycloudflare.com")).toBeNull();
  });

  it("rejects things that aren't server addresses", () => {
    for (const input of ["", "   ", "hello", "ftp://example.com", "https://", "https://a..b.com", "javascript:alert(1)", PLACEHOLDER_ORIGIN]) {
      expect(parseServerAddress(input)).toBeNull();
    }
  });
});

describe("rewriteToServer", () => {
  const origin = "https://calm-river-demo.trycloudflare.com";

  it("points placeholder URLs at the current server", () => {
    expect(rewriteToServer(`${PLACEHOLDER_ORIGIN}/v0/b/demo-muse.appspot.com/o/a.jpg?alt=media&token=t`, origin)).toBe(
      `${origin}/v0/b/demo-muse.appspot.com/o/a.jpg?alt=media&token=t`
    );
    expect(rewriteToServer(PLACEHOLDER_ORIGIN, origin)).toBe(origin);
  });

  it("leaves other URLs alone", () => {
    expect(rewriteToServer("https://picsum.photos/seed/x/800/1000", origin)).toBe("https://picsum.photos/seed/x/800/1000");
    expect(rewriteToServer("file:///data/photo.jpg", origin)).toBe("file:///data/photo.jpg");
    expect(rewriteToServer(`${PLACEHOLDER_ORIGIN}.example.com/x`, origin)).toBe(`${PLACEHOLDER_ORIGIN}.example.com/x`);
    expect(rewriteToServer(`${PLACEHOLDER_ORIGIN}/x`, null)).toBe(`${PLACEHOLDER_ORIGIN}/x`);
  });
});

it("labels a server by its host", () => {
  expect(serverLabel("https://calm-river-demo.trycloudflare.com")).toBe("calm-river-demo.trycloudflare.com");
  expect(serverLabel(null)).toBe("");
});
