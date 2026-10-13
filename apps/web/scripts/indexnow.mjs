#!/usr/bin/env node
/**
 * Tells IndexNow search engines (Bing, Yandex, Seznam, Naver…) that every page on
 * the live site changed, so they recrawl now instead of in weeks. Bing's index also
 * feeds ChatGPT search and Copilot. Run after a deploy:
 *   node apps/web/scripts/indexnow.mjs [https://www.paire.in]
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const site = (process.argv[2] || "https://www.paire.in").replace(/\/+$/, "");
const key = readdirSync(resolve(import.meta.dirname, "../site")).find((file) => /^[a-f0-9]{32}\.txt$/.test(file))?.slice(0, -4);
if (!key) throw new Error("No IndexNow key file in apps/web/site.");
const urls = (await (await fetch(`${site}/urls.txt`)).text()).split("\n").filter(Boolean);
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls })
});
console.log(`IndexNow: ${response.status} for ${urls.length} URLs`);
