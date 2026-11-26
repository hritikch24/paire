// Generate an event-specific PNG locally after an operator has published the room.
const QR = require("../firebase/functions/node_modules/qrcode");
const [id, campaign, output] = process.argv.slice(2);
if (
  !/^[a-zA-Z0-9]{20}$/.test(id ?? "") ||
  !/^[a-z0-9_-]{1,64}$/i.test(campaign ?? "") ||
  !output?.endsWith(".png")
) {
  throw Error("Usage: node scripts/event-qr.cjs ROOM_ID CAMPAIGN OUTPUT.png");
}
const target = new URL("https://www.paire.in/events/");
target.search = new URLSearchParams({
  id,
  utm_source: "poster",
  utm_medium: "qr",
  utm_campaign: campaign,
}).toString();
QR.toFile(output, target.href, { width: 640, margin: 4 }).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
