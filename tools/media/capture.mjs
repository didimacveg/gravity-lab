// Regenerates the screenshots used by the README (docs/img) and the social
// preview image (web/media/og.png) from the real app.
//   cd web && npm install --no-save playwright && npx playwright install chromium
//   node ../tools/media/capture.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = join(fileURLToPath(import.meta.url), "..");
export const repo = join(here, "..", "..");
const require = createRequire(join(repo, "web", "package.json"));
export const { chromium } = require("playwright");

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png" };

// Serves the repository root, so pages under tools/media can import web/js.
export async function serve() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    if (path.endsWith("/") || path === "") path += "index.html";
    try {
      const file = join(repo, path);
      if (!file.startsWith(repo)) throw new Error("outside");
      res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

const setSpeed = (page, v) => page.evaluate((v) => {
  const s = document.getElementById("speed"); s.value = v; s.dispatchEvent(new Event("change"));
}, String(v));
const ready = (page) => page.waitForFunction(() => window.__gl?.state.real && document.fonts.status === "loaded");

async function main() {
  const { url, close } = await serve();
  const app = url + "web/";
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const shot = (page, name) => page.screenshot({ path: join(repo, "docs", "img", name) });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    let page = await ctx.newPage();

    // Hero: the real Solar System some years in, whole inner system and Jupiter.
    await page.goto(app); await ready(page);
    await page.fill("#goto", "2026-11-15"); await page.click("#go");
    await page.waitForFunction(() => !window.__gl.state.seek && window.__gl.state.real.sim.world.time > 9000);
    await page.evaluate(() => { const c = window.__gl.renderer.cam; c.dist = 15; c.pitch = 0.5; c.yaw = -0.9; });
    await page.waitForTimeout(400);
    await shot(page, "solar-system.png");

    // Validation after a century.
    await page.click("#reset"); await page.click("#tabbtn-val"); await page.click("#run100");
    await page.waitForFunction(() => !window.__gl.state.seek && window.__gl.state.real.sim.world.time >= 36512);
    await page.waitForTimeout(600);
    await shot(page, "validation.png");
    await page.evaluate(() => document.querySelector(".panel").scrollTo(0, 690));
    await page.waitForTimeout(300);
    await shot(page, "validation-mercury.png");

    // Experiments.
    await page.click("#tabbtn-exp");
    await page.click("[data-exp=lagrange]"); await setSpeed(page, Infinity);
    await page.waitForFunction(() => window.__gl.state.exp.sim.world.time >= 73000, null, { timeout: 120000 });
    await page.waitForTimeout(600);
    await shot(page, "lagrange.png");
    await page.click("[data-exp=voyager]"); await setSpeed(page, 20);
    await page.waitForFunction(() => window.__gl.state.exp.sim.world.time >= 59.99, null, { timeout: 120000 });
    await page.waitForTimeout(600);
    await shot(page, "voyager.png");
    await page.click("[data-exp=integrators]"); await setSpeed(page, 1826.25);
    await page.waitForFunction(() => window.__gl.state.exp.sim.world.time >= 14600, null, { timeout: 120000 });
    await page.evaluate(() => document.querySelector(".panel").scrollTo(0, 400));
    await page.waitForTimeout(600);
    await shot(page, "integrators.png");
    await page.click("[data-exp=mercury]"); await setSpeed(page, Infinity);
    await page.waitForFunction(() => window.__gl.state.exp.sim.world.time >= 36500, null, { timeout: 120000 });
    await page.waitForTimeout(600);
    await shot(page, "mercury.png");
    await page.close();

    // Phone.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page = await phone.newPage();
    await page.goto(app); await ready(page);
    await page.waitForTimeout(2500);
    await shot(page, "phone.png");
    await page.close();

    // Social preview, 1200 x 630.
    const og = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    page = await og.newPage();
    await page.goto(app); await ready(page);
    await page.addStyleTag({ content: ".panel,.timebar,.hud-note,.chip{display:none!important}.layout{grid-template-columns:1fr!important}" });
    await page.evaluate(() => { window.dispatchEvent(new Event("resize")); const c = window.__gl.renderer.cam; c.dist = 13; c.pitch = 0.5; });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(repo, "web", "media", "og.png") });
  } finally {
    await browser.close(); close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
