// Social cards and the precession video, rendered from the real simulation.
// Open social.html?card=1|2|3|video (served from the repository root).
import { Simulation, Reference, solarSystem, PLANET_NAMES, einsteinPrecession } from "../../web/js/sim.js";
import { Renderer, PLANET_COLORS } from "../../web/js/render.js";
import { buildSky } from "../../web/js/sky.js";
import { elements, ARCSEC_PER_RADIAN } from "../../web/js/physics.js";

const card = new URLSearchParams(location.search).get("card") || "1";
const root = document.getElementById("root");
const get = (u, k) => fetch("../../web/data/" + u).then((r) => r[k]());
const [meta, buf, stars] = await Promise.all([get("horizons.json", "json"), get("horizons_planets.f64", "arrayBuffer"), get("stars.json", "json")]);
const reference = new Reference(new Float64Array(buf), meta);
await Promise.all(["19px 'JetBrains Mono'", "600 17px 'JetBrains Mono'", "16px Inter", "600 16px Inter"].map((f) => document.fonts.load(f)));
await document.fonts.ready;
const fmt = (v) => (v >= 1000 ? Math.round(v).toLocaleString("en-US") : v >= 100 ? v.toFixed(0) : v.toFixed(1));
const URLTEXT = "didimacveg.github.io/gravity-lab";

function scene(canvas, height, cam) {
  canvas.style.height = height + "px";
  const r = new Renderer(canvas);
  r.dprCap = 2; r.resize();
  r.sky = buildSky(stars);
  Object.assign(r.cam, cam);
  return r;
}

function precessionPlot(canvas, height, x, y, upTo = 100) {
  const W = 952, dpr = 2;
  canvas.width = W * dpr; canvas.height = height * dpr; canvas.style.height = height + "px";
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, height);
  const L = 70, R = 20, T = 16, B = 44, pw = W - L - R, ph = height - T - B;
  const X = (v) => L + v / 100 * pw, Y = (v) => T + ph - v / 45 * ph;
  c.font = "19px 'JetBrains Mono'"; c.fillStyle = "#7f8ca1"; c.strokeStyle = "rgba(147,161,181,.16)"; c.lineWidth = 1;
  c.textAlign = "right"; c.textBaseline = "middle";
  for (const v of [0, 10, 20, 30, 40]) { c.beginPath(); c.moveTo(L, Y(v)); c.lineTo(L + pw, Y(v)); c.stroke(); c.fillText(v + "″", L - 10, Y(v)); }
  c.textAlign = "center"; c.textBaseline = "top";
  for (const v of [0, 25, 50, 75, 100]) c.fillText(v, X(v), T + ph + 10);
  c.textAlign = "right"; c.fillText("years", L + pw, T + ph + 10 - 34);
  c.strokeStyle = "#93a1b5"; c.setLineDash([8, 7]); c.lineWidth = 2;
  c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(100), Y(42.98)); c.stroke(); c.setLineDash([]);
  c.strokeStyle = "#4c9dff"; c.lineWidth = 4; c.lineJoin = "round"; c.beginPath();
  let pen = false;
  for (let i = 0; i < x.length && x[i] <= upTo; i++) { if (pen) c.lineTo(X(x[i]), Y(y[i])); else { c.moveTo(X(x[i]), Y(y[i])); pen = true; } }
  c.stroke();
  c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = "#93a1b5";
  c.fillText("dashed: general relativity, 42.98″ per century", L + 14, T + 14);
  c.fillStyle = "#7fd4ff"; c.fillText("solid: measured, 1PN run minus Newtonian run", L + 14, T + 42);
}

const century = () => {
  const sim = new Simulation({ ...solarSystem(meta), method: "yoshida6", dt: 0.25, reference, twin: true });
  sim.advance(36512 * 4);
  return sim;
};
const grSeries = (sim) => {
  const x = [], y = [];
  for (let s = sim.lo; s <= sim.hi; s++) { x.push((s - reference.epochIndex) * 32 / 365.25); y.push(sim.grVarpi[s] * ARCSEC_PER_RADIAN); }
  return [x, y];
};

if (card === "1") {
  const sim = century();
  root.innerHTML = `<div class="card">
    <div class="kicker">gravity-lab · N-body Solar System</div>
    <h1>After 100 simulated years, Mercury is <em>9 km</em> from where NASA says it is.</h1>
    <canvas class="scene" id="c"></canvas>
    <div class="grid" id="g"></div>
    <div class="foot"><span>Position error after 100 years.<br>Reference: NASA/JPL Horizons, DE441.</span><b>${URLTEXT}</b></div>
  </div>`;
  const r = scene(document.getElementById("c"), 560, { dist: 15, pitch: 0.55, yaw: -0.9 });
  r.reset(sim.world); r.draw(sim.world, {});
  document.getElementById("g").innerHTML = PLANET_NAMES.map((n, p) =>
    `<div class="rowp"><i style="background:${PLANET_COLORS[n]}"></i>${n}<b>${fmt(sim.maxErr[p])} km</b></div>`).join("");
} else if (card === "2") {
  const w = (km) => Math.max(1.5, (Math.log10(km) - 0) / 7 * 100);
  const bar = (label, km, bad) => `<div class="bar ${bad ? "bad" : ""}"><div class="lab"><span>${label}</span><b>${fmt(km)} km</b></div><div class="track"><div class="fill" style="width:${w(km)}%"></div></div></div>`;
  root.innerHTML = `<div class="card">
    <div class="kicker">gravity-lab · what the validation found</div>
    <h1>The energy plot looked fine. Mercury was <em>1.66 million km</em> off.</h1>
    <p class="sub">Comparing with NASA/JPL Horizons exposed two errors that every earlier test had passed.</p>
    <div class="bars">
      <h2>Mercury, error after 100 years</h2>
      ${bar("Relativistic force evaluated with a stale velocity", 1660000, true)}
      ${bar("Time-symmetric step, same integrator (Yoshida 4)", 35607)}
      ${bar("Sixth-order integrator, same step", 9.3)}
      <h2>Earth, error after 100 years</h2>
      ${bar("Earth and Moon as a single point", 11686, true)}
      ${bar("With the averaged pull of the Sun on the pair", 303)}
      <div class="axis">Bar length is logarithmic: each tenth of the width is roughly a factor of 5.</div>
    </div>
    <div class="foot"><span>Conserving energy is necessary.<br>It is not sufficient.</span><b>${URLTEXT}</b></div>
  </div>`;
} else if (card === "3") {
  const sim = century(), r = sim.mercuryRates(), [x, y] = grSeries(sim);
  const { world } = solarSystem(meta), el = elements(world, 1, 0);
  root.innerHTML = `<div class="card">
    <div class="kicker">gravity-lab · Mercury's perihelion</div>
    <h1>General relativity, measured in a browser tab.</h1>
    <div class="big">${r.gr.toFixed(2)}″ <small>per century</small></div>
    <p class="sub">Two copies of the Solar System, one Newtonian and one with the relativistic correction. The angle between their Mercury perihelia grows in a straight line.</p>
    <canvas class="plot" id="p"></canvas>
    <div class="trio">
      <div><span>This simulation</span><b>${r.gr.toFixed(3)}″</b></div>
      <div><span>Einstein's formula</span><b>${einsteinPrecession(el.a, el.e, world.mass[0]).toFixed(3)}″</b></div>
      <div><span>Accepted value</span><b>42.98″</b></div>
    </div>
    <div class="foot"><span>Initial state: NASA/JPL Horizons, DE441.<br>Yoshida 6 integrator, 0.25-day step.</span><b>${URLTEXT}</b></div>
  </div>`;
  precessionPlot(document.getElementById("p"), 360, x, y);
} else if (card === "video") {
  root.innerHTML = `<div class="card">
    <div class="kicker">gravity-lab · Mercury's perihelion</div>
    <h1 style="font-size:50px">Measuring general relativity with two simulations</h1>
    <canvas class="scene" id="c" style="margin-top:22px"></canvas>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:20px">
      <div class="big" style="font-size:104px;margin-top:0"><span id="rate">··.··</span><small style="font-size:34px"> ″/century</small></div>
      <div class="note" style="text-align:right;margin:0"><span id="year">2000</span><br><span id="angle">0.00″</span> between perihelia</div>
    </div>
    <canvas class="plot" id="p" style="margin-top:10px"></canvas>
    <div class="foot" style="font-size:18px"><span id="result">Accepted value: 42.98″ per century.<br>Unexplained from 1859 until Einstein, 1915.</span><b>${URLTEXT}</b></div>
  </div>`;
  const sim = new Simulation({ ...solarSystem(meta), method: "yoshida6", dt: 0.25, reference, twin: true });
  const r = scene(document.getElementById("c"), 500, { dist: 1.55, pitch: 1.25, yaw: -1.0 });
  r.show.grid = false; r.show.starNames = false; r.reset(sim.world);
  r.styleOf = ((orig) => (w, i) => (i === 1 ? orig.call(r, w, i) : { ...orig.call(r, w, i), color: i === 0 ? "#ffd98a" : "#33405a" }))(r.styleOf);
  const K = 3000, plot = document.getElementById("p");
  const daysAt = (f) => {
    if (f < 60) return 0;
    if (f < 180) return (f - 60) * 1.5;
    if (f >= 480) return 36512;
    const u = (f - 180) / 300;
    return Math.min(36512, 180 + 1.5 * (f - 180) + (36512 - 180 - 450) * u ** 2.5);
  };
  const line = (ctx, a, b, color, dash) => {
    const va = [0, 0, 0], vb = [0, 0, 0], sa = [0, 0], sb = [0, 0];
    if (r._view(a, va) <= 0 || r._view(b, vb) <= 0) return null;
    r._toScreen(va, sa); r._toScreen(vb, sb);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke(); ctx.setLineDash([]);
    return sb;
  };
  window.renderFrame = (f) => {
    const target = Math.round(daysAt(f) * 4) / 4, w = sim.world;
    if (target > w.time) sim.advance(Math.round((target - w.time) * 4));
    r.draw(w, {});
    // Perihelion directions: Newtonian twin (grey) and 1PN (blue). The angle
    // between them is drawn K times larger than it is.
    const elN = elements(sim.twin, 1, 0), elG = elements(w, 1, 0);
    let d = elG.varpi - elN.varpi; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    const e = elN.evec.map((v) => v / elN.e), hn = Math.hypot(...elN.h), h = elN.h.map((v) => v / hn);
    const q = [h[1] * e[2] - h[2] * e[1], h[2] * e[0] - h[0] * e[2], h[0] * e[1] - h[1] * e[0]];
    const sun = [0, 0, 0], len = elN.a * (1 - elN.e) * 1.35;
    const dir = (ang) => e.map((v, k) => (v * Math.cos(ang) + q[k] * Math.sin(ang)) * len);
    const ctx = r.ctx;
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.font = "600 17px 'JetBrains Mono'";
    const pn = line(ctx, sun, dir(0), "#93a1b5", [6, 6]);
    const pg = line(ctx, sun, dir(d * K), "#7fd4ff", []);
    if (pn) { ctx.fillStyle = "#93a1b5"; ctx.fillText("Newtonian", pn[0] + 8, pn[1] + 18); }
    if (pg) { ctx.fillStyle = "#7fd4ff"; ctx.fillText("with relativity", pg[0] + 8, pg[1] - 8); }
    ctx.fillStyle = "#7f8ca1"; ctx.font = "16px 'JetBrains Mono'";
    ctx.fillText(`perihelion directions · angle drawn ×${K} for visibility`, 16, 28);
    const rates = sim.mercuryRates(), [x, y] = grSeries(sim);
    document.getElementById("rate").textContent = rates && rates.spanYears >= 1.5 ? rates.gr.toFixed(2) : "··.··";
    document.getElementById("year").textContent = (2000 + w.time / 365.25).toFixed(w.time < 400 ? 2 : 0);
    document.getElementById("angle").textContent = (d * ARCSEC_PER_RADIAN).toFixed(2) + "″";
    precessionPlot(plot, 300, x, y, w.time / 365.25);
    document.getElementById("result").style.opacity = String(Math.max(0, Math.min(1, (f - 485) / 25)));
  };
  window.renderFrame(0);
}
window.cardReady = true;
