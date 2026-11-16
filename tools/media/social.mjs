// Renders the LinkedIn images (1080 x 1350) and the precession video.
//   cd web && npm install --no-save playwright && npx playwright install chromium
//   node ../tools/media/social.mjs          (needs ffmpeg for the video)
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { serve, chromium, repo } from "./capture.mjs";

const out = join(repo, "docs", "linkedin");
await mkdir(out, { recursive: true });
const { url, close } = await serve();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.error(e); process.exitCode = 1; });
  for (const [card, file] of [["1", "post1-validation.png"], ["2", "post2-what-it-found.png"], ["3", "post3-mercury.png"]]) {
    await page.goto(`${url}tools/media/social.html?card=${card}`);
    await page.waitForFunction(() => window.cardReady, null, { timeout: 120000 });
    await page.screenshot({ path: join(out, file) });
    console.log(file);
  }
  await page.goto(`${url}tools/media/social.html?card=video`);
  await page.waitForFunction(() => window.cardReady, null, { timeout: 120000 });
  const frames = await mkdtemp(join(tmpdir(), "gl-frames-"));
  const total = 600;
  for (let f = 0; f < total; f++) {
    await page.evaluate((f) => window.renderFrame(f), f);
    await page.screenshot({ path: join(frames, `f${String(f).padStart(4, "0")}.png`) });
    if (f % 100 === 0) console.log(`frame ${f}/${total}`);
  }
  await page.screenshot({ path: join(out, "post3-video-poster.png") });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(frames, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart",
    join(out, "post3-mercury-precession.mp4")]);
  await rm(frames, { recursive: true, force: true });
  console.log("post3-mercury-precession.mp4");
} finally {
  await browser.close(); close();
}
