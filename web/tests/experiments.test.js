// Numerical checks behind the guided experiments (same thresholds as
// tests/test_experiments.cpp).
import test from "node:test";
import assert from "node:assert/strict";
import { meta } from "./helpers.js";
import { leadAngle, AU_KM } from "../js/physics.js";
import { Simulation, solarSystem, lagrangeIdeal, voyager, relSpeed, distanceKm, vInfinity,
         jdToDate, dateToJd } from "../js/sim.js";

test("real Trojans librate around L4 and L5 and match Horizons after a century", () => {
  const sys = solarSystem(meta, { trojans: true });
  const sim = new Simulation({ ...sys, method: "yoshida6", dt: 0.5 });
  const w = sim.world, ids = sys.trojans, step = meta.trojan_step_days;
  let worst = 0;
  const lo = ids.map(() => Infinity), hi = ids.map(() => -Infinity);
  for (let k = 1; k < meta.trojans[0].ref.length; k++) {
    for (let j = 0; j < 28; j++) {
      sim.advance(step / 0.5 / 28);
      ids.forEach((id, i) => { const a = leadAngle(w, id, 5); lo[i] = Math.min(lo[i], a); hi[i] = Math.max(hi[i], a); });
    }
    assert.ok(Math.abs(w.time - k * step) < 1e-9);
    ids.forEach((id, i) => {
      const r = meta.trojans[i].ref[k], o = 3 * id;
      worst = Math.max(worst, Math.hypot(w.pos[o] - r[0], w.pos[o + 1] - r[1], w.pos[o + 2] - r[2]) * AU_KM);
    });
  }
  assert.ok(worst < 600, `worst Trojan error ${worst} km`);
  ids.forEach((_, i) => {
    const s = i < 3 ? 1 : -1;
    assert.ok(s * lo[i] > 30 && s * hi[i] > 30 && s * lo[i] < 95 && s * hi[i] < 95, `${meta.trojans[i].name}: ${lo[i]}..${hi[i]}`);
  });
});

test("libration period at L4 matches linear theory", () => {
  const sys = lagrangeIdeal(meta, [2]);
  const sim = new Simulation({ ...sys, method: "yoshida4", dt: 2, forces: { pn: false, emq: false } });
  const w = sim.world, window = Math.round(sys.jupiterPeriod / 2);
  const crossings = [];
  let prev = null;
  for (let k = 0; k < Math.floor(900 * 365.25 / 2 / window); k++) {
    let acc = 0;
    for (let i = 0; i < window; i++) { sim.advance(1); acc += leadAngle(w, sys.trojans[0], 1); }
    const mean = acc / window, t = w.time - window;
    if (prev && prev.mean < 60 && mean >= 60) crossings.push(prev.t + (60 - prev.mean) / (mean - prev.mean) * (t - prev.t));
    prev = { mean, t };
    assert.ok(mean > 55 && mean < 65);
  }
  assert.ok(crossings.length >= 4);
  const period = (crossings.at(-1) - crossings[0]) / (crossings.length - 1);
  assert.ok(Math.abs(period / sys.libTheoryDays - 1) < 0.02, `${period / 365.25} vs ${sys.libTheoryDays / 365.25} yr`);
});

test("Voyager 2 gains 10 km/s at Jupiter and keeps its speed relative to Jupiter", () => {
  const sys = voyager(meta), ref = sys.ref;
  const sim = new Simulation({ ...sys, method: "yoshida6", dt: 1 / 96, forces: { emq: false } });
  const w = sim.world, P = sys.probe, J = sys.jupiter;
  const vIn = relSpeed(w, P, 0), vInfIn = vInfinity(w, P, J);
  let closest = Infinity, errBefore = 0;
  for (let k = 1; k < ref.samples; k++) {
    for (let s = 0; s < 24; s++) { sim.advance(1); closest = Math.min(closest, distanceKm(w, P, J)); }
    if (k === 120) {
      const r = ref.probe[k], o = 3 * P;
      errBefore = Math.hypot(w.pos[o] - r[0], w.pos[o + 1] - r[1], w.pos[o + 2] - r[2]) * AU_KM;
    }
  }
  const last = ref.samples - 1, a = ref.probe[last], s = ref.sun[last], o = 3 * P;
  const vRef = Math.hypot(a[3] - s[3], a[4] - s[4], a[5] - s[5]) * AU_KM / 86400;
  const vOut = relSpeed(w, P, 0);
  const errAfter = Math.hypot(w.pos[o] - a[0], w.pos[o + 1] - a[1], w.pos[o + 2] - a[2]) * AU_KM;
  assert.ok(vOut - vIn > 9.5, `gain ${vOut - vIn}`);
  assert.ok(Math.abs(vOut - vRef) < 0.05, `${vOut} vs JPL ${vRef}`);
  assert.ok(Math.abs(closest - 721670) < 2000, `closest ${closest}`);
  assert.ok(Math.abs(vInfinity(w, P, J) / vInfIn - 1) < 1e-3);
  assert.ok(errBefore < 1000 && errAfter < 250000, `${errBefore} ${errAfter}`);
});

test("Julian date conversion", () => {
  assert.deepEqual(jdToDate(2451545.0), { year: 2000, month: 1, day: 1, hour: 12, minute: 0 });
  assert.equal(dateToJd(2000, 1, 1), 2451544.5);
  assert.equal(dateToJd(1979, 7, 9), 2444063.5);
  for (const [y, m, d] of [[1900, 3, 1], [1999, 12, 31], [2024, 2, 29], [2100, 1, 1]]) {
    const back = jdToDate(dateToJd(y, m, d));
    assert.deepEqual([back.year, back.month, back.day, back.hour], [y, m, d, 0]);
  }
});
