const { chromium, webkit, firefox } = require(
  process.env.MUSE_PLAYWRIGHT_MODULE || "playwright",
);
const fs = require("node:fs/promises");
const root = require("node:path").resolve(__dirname, "..");
(async () => {
  for (const engine of [chromium, webkit, firefox]) {
    let browser;
    try {
      browser = await engine.launch();
    } catch {
      console.log(engine.name(), "unavailable");
      continue;
    }
    for (const width of [320, 390, 768, 1440]) {
      const mobile = width === 390 && engine !== firefox;
      const device = mobile
        ? {
            hasTouch: true,
            isMobile: true,
            userAgent:
              engine === webkit
                ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0"
                : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
          }
        : {};
      const page = await browser.newPage({
        ...device,
        viewport: { width, height: 830 },
        reducedMotion: "reduce",
      });
      if (engine === chromium && width === 390) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 300,
          downloadThroughput: 128000,
          uploadThroughput: 64000,
        });
      }
      const calls = [];
      await page.route("**/*", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.startsWith("/events/api/")) {
          calls.push(path);
          const result = path.includes("Deck")
            ? { count: 2 }
            : {
                title: "QA fixture · Community gathering",
                category: "Social gathering",
                venue: "Local test venue",
                city: "Pune",
                timezone: "Asia/Kolkata",
                start: 1800000000000,
                end: 1800003600000,
                closesAt: 1800608400000,
                open: true,
              };
          return route.fulfill({ json: { result } });
        }
        const filename = path.endsWith("/")
          ? "index.html"
          : path.split("/").pop();
        return route.fulfill({
          contentType: filename.endsWith("css")
            ? "text/css"
            : filename.endsWith("js")
              ? "text/javascript"
              : "text/html",
          body: await fs.readFile(
            filename === "index.html"
              ? root + "/firebase/functions/templates/event-room.html"
              : root + "/apps/web/site/events/" + filename,
          ),
        });
      });
      await page.goto(
        "http://localhost/events/?id=LocalFixture123456789&utm_source=qa",
      );
      await page.locator("#adult").check();
      await page.locator("#load").click();
      await page.waitForFunction(() =>
        document.querySelector("#card").textContent.includes("1 of 2"),
      );
      await page.locator("#next").click();
      await page.locator("#next").click();
      await page.locator("#back").click();
      if (
        !(await page.locator("#card").textContent()).includes("2 of 2") ||
        calls.length !== 2 ||
        (await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ))
      )
        throw Error("preview regression");
      if (width === 390 || width === 1440)
        await page.screenshot({
          path:
            root +
            "/docs/evidence/event-rooms/" +
            engine.name() +
            "-" +
            width +
            ".png",
          fullPage: true,
        });
      console.log(engine.name(), width, "passed");
      await page.close();
    }
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
