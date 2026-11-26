import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderEventListing } from "../src/eventListing";

test("shared listing renders event details without JS and escapes embedded HTML", () => {
  const room = {
    title: 'Final <$&>"',
    category: "Sports",
    city: "Pune",
    venue: "East stand",
    timezone: "Asia/Kolkata",
    start: 0,
    end: 3600000,
    closesAt: 608400000,
    open: true,
    cover: null,
  };
  const template = readFileSync(
    resolve(__dirname, "../templates/event-room.html"),
    "utf8",
  );
  const html = renderEventListing(template, "ABCDEFGHIJKLMNOPQRST", room);
  expect(html).toContain("<h1>Final &lt;$&amp;&gt;&quot;</h1>");
  expect(html).toContain("East stand · Pune");
  expect(html).toContain("Room closes");
  expect(html).toContain("data-room=");
  expect(html).toContain('property="og:title"');
  expect(html).not.toContain("Loading event details");
});
