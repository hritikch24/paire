import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
type Listing = {
  title: string;
  city: string;
  category: string;
  venue: string;
  timezone: string;
  start: number;
  end: number;
  closesAt: number;
  open: boolean;
  cover: string | null;
};

export function renderEventListing(
  template: string,
  id: string,
  listing: Listing,
) {
  const time = new Intl.DateTimeFormat("en-IN", {
    timeZone: listing.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const details = [
    listing.category,
    listing.venue,
    listing.city,
    time.format(listing.start) + " – " + time.format(listing.end),
    listing.timezone,
    (listing.open ? "Room closes " : "Room closed · scheduled close ") +
      time.format(listing.closesAt),
  ].join(" · ");
  const title = escapeHtml(listing.title);
  const canonical = "https://www.paire.in/events/?id=" + id;
  return template
    .replace(
      "<title>Event room · Paire</title>",
      () =>
        `<title>${title} · Paire</title><link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${title} · Paire"><meta property="og:description" content="${escapeHtml(details)}">`,
    )
    .replace(
      "<main>",
      () => `<main data-room="${escapeHtml(JSON.stringify(listing))}">`,
    )
    .replace("<h1>Event room</h1>", () => `<h1>${title}</h1>`)
    .replace("Loading event details…", () => escapeHtml(details));
}

export const publicEventListing = onRequest(
  { region: REGION },
  async (req, res) => {
    const id = req.query.id;
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.set("Allow", "GET, HEAD").status(405).end();
      return;
    }
    if (typeof id !== "string" || !/^[A-Za-z0-9]{20}$/.test(id)) {
      res.status(404).send("Room unavailable.");
      return;
    }
    const room = (await db.collection("eventRooms").doc(id).get()).data();
    if (!room || !["published", "closed"].includes(room.status)) {
      res.status(404).send("Room unavailable.");
      return;
    }
    const { title, city, category, venue, timezone, start, end, closesAt } =
      room;
    const template = await readFile(join(__dirname, "event-room.html"), "utf8");
    res.set("Cache-Control", "public, no-cache, must-revalidate");
    res
      .type("html")
      .send(
        renderEventListing(template, id, {
          title,
          city,
          category,
          venue,
          timezone,
          start,
          end,
          closesAt,
          open: room.status === "published" && Date.now() < closesAt,
          cover: room.cover ?? null,
        }),
      );
  },
);
