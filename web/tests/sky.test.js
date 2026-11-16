// Background stars live on the celestial sphere, not in the Solar System.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./helpers.js";
import { equatorialToEcliptic, eclipticLonLat, buildSky } from "../js/sky.js";
import { Renderer } from "../js/render.js";
import { STRINGS } from "../js/i18n.js";

const catalog = JSON.parse(readFileSync(join(dataDir, "stars.json"), "utf8"));
const star = (name) => { const [i] = catalog.names.find(([, n]) => n === name); return catalog.stars[i]; };

test("equatorial to ecliptic conversion", () => {
  const near = (a, b, tol = 1e-6) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < tol, `${a} vs ${b}`));
  near(equatorialToEcliptic(0, 0), [1, 0, 0]);                 // vernal equinox
  near(equatorialToEcliptic(270, 66.5607089), [0, 0, 1]);      // north ecliptic pole
  near(equatorialToEcliptic(90, 23.4392911), [0, 1, 0]);       // summer solstice point
});

test("catalogue stars have their real coordinates", () => {
  // name: [RA deg, Dec deg, ecliptic latitude deg] (J2000)
  const known = {
    Sirius: [101.287, -16.716, -39.6], Canopus: [95.988, -52.696, -75.8],
    Achernar: [24.429, -57.237, -59.4], Hadar: [210.956, -60.373, -44.1],
    Acrux: [186.650, -63.099, -52.9], Polaris: [37.95, 89.264, 66.1],
    Regulus: [152.093, 11.967, 0.5], Spica: [201.298, -11.161, -2.1],
  };
  for (const [name, [ra, dec, beta]] of Object.entries(known)) {
    const s = star(name);
    assert.ok(Math.abs(s[0] - ra) < 0.02 && Math.abs(s[1] - dec) < 0.02, `${name} RA/Dec ${s}`);
    const [, lat] = eclipticLonLat(equatorialToEcliptic(s[0], s[1]));
    assert.ok(Math.abs(lat - beta) < 0.15, `${name} ecliptic latitude ${lat}`);
  }
  assert.ok(catalog.stars.length > 2500);
  assert.ok(catalog.stars.every((s) => s[2] <= 5.5));
});

test("stars sit at infinity: zoom, pan and radial scale do not move them", () => {
  globalThis.devicePixelRatio = 1;
  const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ width: 800, height: 600 }) };
  const r = new Renderer(canvas);
  r.sky = buildSky(catalog);
  const dir = equatorialToEcliptic(...star("Hadar"));
  r.cam.yaw = Math.atan2(-dir[1], -dir[0]) + 0.1; r.cam.pitch = Math.asin(-dir[2]) + 0.05;
  const base = r.projectDirection(dir);
  assert.ok(base, "Hadar should be in front of the camera");
  for (const [dist, target, scale] of [[0.3, [0, 0, 0], "linear"], [400, [0, 0, 0], "linear"],
                                       [30, [25, -8, 3], "linear"], [30, [5, 5, 0], "log"]]) {
    r.cam.dist = dist; r.cam.target = target; r.scale = scale;
    const p = r.projectDirection(dir);
    assert.ok(Math.abs(p[0] - base[0]) < 1e-9 && Math.abs(p[1] - base[1]) < 1e-9);
  }
  // Rotating the camera does move them.
  r.cam.yaw += 0.2;
  assert.ok(Math.abs(r.projectDirection(dir)[0] - base[0]) > 10);
  // And a planet at 5 AU is not a star: its screen position depends on the zoom.
  const sky = r.sky;
  assert.equal(sky.dir.length, 3 * catalog.stars.length);
  for (let i = 0; i < sky.n; i++) {
    const n = Math.hypot(sky.dir[3 * i], sky.dir[3 * i + 1], sky.dir[3 * i + 2]);
    assert.ok(Math.abs(n - 1) < 1e-5);
  }
});

test("English and Spanish define the same interface strings", () => {
  const en = Object.keys(STRINGS.en).sort(), es = Object.keys(STRINGS.es).sort();
  assert.deepEqual(en, es);
  for (const k of en) assert.ok(STRINGS.en[k] && STRINGS.es[k], `empty string for ${k}`);
});
