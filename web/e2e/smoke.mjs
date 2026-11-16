// End-to-end smoke test: serves web/, opens it in headless Chromium and
// checks that the page does what the README says it does.
//   npm install --no-save playwright && npx playwright install chromium
//   node e2e/smoke.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = join(fileURLToPath(import.meta.url), "..", "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
                ".woff2": "font/woff2", ".f64": "application/octet-stream", ".png": "image/png" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    const file = join(root, path || "index.html");
    if (!file.startsWith(root)) throw new Error("outside root");
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures++; };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [name, viewport] of [["desktop", { width: 1366, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__gl?.state.real, null, { timeout: 15000 });
    check(await page.evaluate(() => document.documentElement.lang) === "en", `${name}: English by default`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no horizontal overflow`);

    // The simulation advances and shows a real date.
    const t0 = await page.evaluate(() => window.__gl.state.real.sim.world.time);
    await page.waitForTimeout(700);
    check(await page.evaluate(() => window.__gl.state.real.sim.world.time) > t0, `${name}: time advances`);
    check(/^20\d\d-\d\d-\d\d \d\d:\d\d$/.test(await page.textContent("#hud-date")), `${name}: calendar date on screen`);

    // Validation: run a century and read the numbers off the panel.
    await page.click("#tabbtn-val");
    await page.click("#run100");
    await page.waitForFunction(() => window.__gl.state.real.sim.world.time >= 36512 && !window.__gl.state.seek, null, { timeout: 60000 });
    await page.waitForTimeout(400);
    const gr = parseFloat(await page.textContent("#gr-value"));
    check(Math.abs(gr - 42.98) < 0.05, `${name}: Mercury relativistic precession ${gr} arcsec/century`);
    const maxErr = await page.evaluate(() => Array.from(window.__gl.state.real.sim.maxErr));
    check(maxErr.every((e, i) => e < [25, 12, 500, 60, 60, 40, 400, 900][i]), `${name}: errors vs Horizons ${maxErr.map((e) => e.toFixed(0)).join(" ")} km`);
    check((await page.textContent("#hud-date")).startsWith("2099-12-19"), `${name}: stops at the requested date`);

    // Go to a date in the past: integrates backwards.
    await page.fill("#goto", "1969-07-20");
    await page.click("#go");
    await page.waitForFunction(() => !window.__gl.state.seek && window.__gl.state.real.sim.world.time < 0, null, { timeout: 60000 });
    check((await page.textContent("#hud-date")).startsWith("1969-07-20"), `${name}: go to date 1969-07-20`);

    // Stars are a backdrop: zooming the orbits must not move them.
    const star = await page.evaluate(() => {
      const r = window.__gl.renderer, d = [r.sky.dir[0], r.sky.dir[1], r.sky.dir[2]];
      r.cam.yaw = Math.atan2(-d[1], -d[0]); r.cam.pitch = Math.asin(-d[2]);
      const a = r.projectDirection(d); r.cam.dist *= 40; const b = r.projectDirection(d);
      return [a, b];
    });
    check(star[0] && Math.hypot(star[0][0] - star[1][0], star[0][1] - star[1][1]) < 1e-9, `${name}: stars do not scale with zoom`);

    // Every experiment loads and renders its checks.
    await page.click("#tabbtn-exp");
    for (const id of ["mercury", "lagrange", "voyager", "integrators"]) {
      await page.click(`[data-exp=${id}]`);
      await page.waitForTimeout(500);
      check(await page.locator(".checks-list li").count() >= 2, `${name}: experiment ${id}`);
    }
    // Voyager at full speed reaches the end and every check passes.
    await page.click("[data-exp=voyager]");
    await page.selectOption("#speed", "20");
    await page.waitForFunction(() => window.__gl.state.exp.sim.world.time >= 59.99, null, { timeout: 60000 });
    await page.waitForTimeout(500);
    check(await page.locator(".checks-list .badge.pass").count() === 5, `${name}: Voyager 2 checks pass`);

    // What-if is labelled as hypothetical.
    await page.click("#tabbtn-what");
    check((await page.textContent("#chip")).includes("WHAT IF"), `${name}: what-if banner`);
    await page.click("#bh-drop");
    await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__gl.state.what.sim.hole >= 0), `${name}: black hole added`);

    // Spanish.
    await page.click("[data-lang=es]");
    check((await page.textContent("#tabbtn-val")) === "Validación", `${name}: Spanish`);
    await page.click("#tabbtn-sim");
    check((await page.textContent("#chip")).includes("Sistema solar real"), `${name}: back to the real system`);

    check(errors.length === 0, `${name}: no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
    await page.close();
  }

  // Reduced motion: starts paused.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__gl?.state.real, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__gl.state.real.sim.world.time) === 0, "prefers-reduced-motion: starts paused");
} finally {
  await browser.close();
  server.close();
}
process.exit(failures ? 1 : 0);
