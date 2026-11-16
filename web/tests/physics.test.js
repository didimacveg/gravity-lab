// The JavaScript port is held to the same numbers as the C++ core.
import test from "node:test";
import assert from "node:assert/strict";
import { meta, reference, table } from "./helpers.js";
import {
  World, computeAccelerations, step, diagnostics, elements, angleRate, toArcsecPerCentury,
  processCaptures, schwarzschildRadius, AU_KM, G,
} from "../js/physics.js";
import { Simulation, solarSystem, sunMercury, einsteinPrecession, measureOrders, PLANET_NAMES } from "../js/sim.js";

const centuryRun = (method, dt, forces = {}) => {
  const sim = new Simulation({ ...solarSystem(meta), method, dt, reference, twin: true, forces });
  sim.advance(Math.round(36512 / dt));
  return sim;
};
const best = centuryRun("yoshida6", 0.25);

test("initial state is the reference sample at J2000, bit for bit", () => {
  const { world } = solarSystem(meta);
  for (let b = 0; b < 9; b++) {
    const p = reference.position(reference.epochIndex, b);
    for (let k = 0; k < 3; k++) assert.equal(world.pos[3 * b + k], p[k]);
  }
  for (let b = 1; b < 9; b++) assert.equal(reference.errorKm(world, reference.epochIndex, b), 0);
});

test("a century of integration stays within the validated error of JPL Horizons", () => {
  //             Mer Ven Ear  Mar Jup Sat Ura  Nep
  const limit = [25, 12, 500, 60, 60, 40, 400, 900];
  PLANET_NAMES.forEach((name, p) => assert.ok(best.maxErr[p] < limit[p], `${name}: ${best.maxErr[p]} km`));
  assert.ok(best.maxErr[7] > 50, "the model is not DE441: the error cannot be trivially zero");
});

test("JavaScript and C++ agree on the error against Horizons", () => {
  for (const [method, id] of [["yoshida6", "yoshida6_0.25"], ["rk4", "rk4_0.25"], ["yoshida4", "yoshida4_0.25"]]) {
    const sim = method === "yoshida6" ? best : centuryRun(method, 0.25);
    const cpp = table.cases.find((c) => c.id === id).checkpoints[2].km;
    cpp.forEach((km, p) => {
      const tol = 0.02 * km + 0.5;
      assert.ok(Math.abs(sim.maxErr[p] - km) < tol, `${id} ${PLANET_NAMES[p]}: js ${sim.maxErr[p]} vs c++ ${km}`);
    });
  }
});

test("general relativity adds 42.98 arcsec/century to Mercury's perihelion", () => {
  const r = best.mercuryRates();
  assert.ok(Math.abs(r.gr - 42.98) < 0.05, `1PN - Newton = ${r.gr}`);
  assert.ok(Math.abs(r.sim - r.de441) < 0.1, `sim ${r.sim} vs DE441 ${r.de441}`);
  assert.ok(Math.abs(r.de441 - meta.mercury_varpi_rate_arcsec_cy) < 1e-6);
});

test("the twin-run measurement is robust to a coarse integrator", () => {
  // Yoshida 4 at 0.25 d has 165 arcsec/century of spurious precession, but
  // it is the same in both runs and cancels in the difference.
  const r = centuryRun("yoshida4", 0.25).mercuryRates();
  assert.ok(Math.abs(r.sim - r.de441) > 100);
  assert.ok(Math.abs(r.gr - 42.98) < 0.05, `gr = ${r.gr}`);
});

test("without relativity Mercury is off by thousands of km", () => {
  const newton = centuryRun("yoshida6", 0.25, { pn: false });
  assert.ok(newton.maxErr[0] > 10000);
  assert.equal(newton.twin, null);
});

test("the Earth-Moon quadrupole cuts Earth's error by more than 20x", () => {
  const point = centuryRun("yoshida6", 0.25, { emq: false });
  assert.ok(point.maxErr[2] > 10000);
  assert.ok(best.maxErr[2] * 20 < point.maxErr[2]);
});

test("two-body 1PN precession matches Einstein's formula", () => {
  const { world: w } = sunMercury(meta), cfg = { pn: true };
  computeAccelerations(w, cfg);
  const el = elements(w, 1, 0), formula = einsteinPrecession(el.a, el.e, w.mass[0]);
  const t = [], a = [];
  for (let k = 0; k < 36525; k++) {
    for (let i = 0; i < 4; i++) step(w, 0.25, "yoshida6", cfg);
    if (k % 8 === 0) { t.push(w.time); a.push(elements(w, 1, 0).varpi); }
  }
  const rate = toArcsecPerCentury(angleRate(t, a));
  assert.ok(Math.abs(formula - 42.98) < 0.03, `formula ${formula}`);
  assert.ok(Math.abs(rate - formula) < 0.02, `measured ${rate} vs ${formula}`);
});

test("each integrator converges at its theoretical order", () => {
  const o = measureOrders();
  assert.ok(Math.abs(o.euler - 1) < 0.15, `euler ${o.euler}`);
  assert.ok(Math.abs(o.verlet - 2) < 0.1, `verlet ${o.verlet}`);
  assert.ok(Math.abs(o.rk4 - 4) < 0.3, `rk4 ${o.rk4}`);
  assert.ok(Math.abs(o.yoshida4 - 4) < 0.3, `yoshida4 ${o.yoshida4}`);
  assert.ok(Math.abs(o.yoshida6 - 6) < 0.5, `yoshida6 ${o.yoshida6}`);
});

test("symplectic steps with the 1PN term are time-reversible, Euler is not", () => {
  const cfg = { pn: true, emq: true };
  for (const m of ["verlet", "yoshida4", "yoshida6", "euler"]) {
    const { world: w } = solarSystem(meta);
    computeAccelerations(w, cfg);
    const start = w.pos.slice();
    for (let i = 0; i < 2000; i++) step(w, 0.5, m, cfg);
    for (let i = 0; i < 2000; i++) step(w, -0.5, m, cfg);
    let d = 0;
    for (let k = 0; k < 27; k++) d = Math.max(d, Math.abs(w.pos[k] - start[k]));
    if (m === "euler") assert.ok(d > 1e-3); else assert.ok(d < 2e-11, `${m}: ${d}`);
  }
});

test("energy with the 1PN term is conserved; Euler drifts, Yoshida does not", () => {
  const { world: w } = sunMercury(meta), cfg = { pn: true };
  w.mass[1] = 1.66e-7;
  computeAccelerations(w, cfg);
  const n0 = diagnostics(w).total, p0 = diagnostics(w, true).total;
  let newton = 0, full = 0;
  for (let i = 0; i < 4000; i++) {
    step(w, 0.05, "yoshida6", cfg);
    newton = Math.max(newton, Math.abs(diagnostics(w).total / n0 - 1));
    full = Math.max(full, Math.abs(diagnostics(w, true).total / p0 - 1));
  }
  assert.ok(newton > 1e-8 && full < 1e-11, `${newton} ${full}`);

  const drift = (method) => {
    const sim = new Simulation({ ...solarSystem(meta), method, dt: 0.5, forces: { pn: false, emq: false } });
    sim.advance(7305);  // 10 years
    return sim.maxDrift;
  };
  assert.ok(drift("euler") > 1e-3);
  assert.ok(drift("yoshida4") < 1e-8);
});

test("momentum is conserved by the force loop and by captures", () => {
  const { world: w } = solarSystem(meta);
  const p0 = diagnostics(w).p;
  computeAccelerations(w, { pn: false, emq: true });
  let f = [0, 0, 0];
  for (let i = 0; i < w.n; i++) for (let k = 0; k < 3; k++) f[k] += w.mass[i] * w.acc[3 * i + k];
  assert.ok(Math.hypot(...f) < 1e-18);
  const h = w.add("Black hole", "blackhole", 1e6, [3, 0, 0, 0, 0, 0]);
  const before = diagnostics(w).p;
  const eaten = processCaptures(w, h, 50);   // forced radius: swallow what is inbound and near
  assert.ok(eaten.length > 0);
  assert.ok(Math.abs(diagnostics(w).p - before) < 1e-12 * Math.max(1, before), `${p0}`);
});

test("a 10 solar-mass black hole swallows nothing at true scale", () => {
  const rsKm = schwarzschildRadius(1) * AU_KM;
  assert.ok(Math.abs(rsKm - 2.953) < 0.01);
  const w = new World(4);
  w.add("hole", "blackhole", 10, [0, 0, 0, 0, 0, 0]);
  const v = Math.sqrt(G * 10 / 1);
  w.add("planet", "planet", 1e-6, [1, 0, 0, 0, v, 0]);
  assert.equal(processCaptures(w, 0).length, 0);
  // A magnified horizon captures only what reaches the drawn disc.
  assert.equal(processCaptures(w, 0, 0.5).length, 0);
  assert.equal(processCaptures(w, 0, 1.01).length, 1);
});
