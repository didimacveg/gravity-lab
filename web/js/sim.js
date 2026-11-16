// Scenario builders and the Simulation wrapper that compares a running
// world against the JPL Horizons reference. Pure module (no DOM): shared by
// the app and by the Node tests.
import {
  World, computeAccelerations, step, stepAdaptive, sanitize, diagnostics, elements,
  angleRate, toArcsecPerCentury, processCaptures, schwarzschildRadius,
  G, C_LIGHT, AU_KM, KMS_PER_AUD,
} from "./physics.js";

export const PLANET_NAMES = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
export const ACCEPTED_GR_PRECESSION = 42.98;   // arcsec per Julian century
export const DT_CHOICES = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8];

// ---------- reference ephemeris ----------

export class Reference {
  // data: Float64Array [sample][body][xyz]; meta: horizons.json
  constructor(data, meta) {
    this.data = data;
    this.samples = meta.samples;
    this.bodies = meta.planets.length;
    this.epochIndex = meta.epoch_index;
    this.cadence = meta.cadence_days;
    this.epochJD = meta.epoch_jd;
    this.varpi = meta.mercury_varpi;
    if (data.length !== this.samples * this.bodies * 3) throw new Error("reference size mismatch");
  }
  // Heliocentric position error of planet `body` (1..8), km. Comparing
  // (planet - Sun) keeps the result independent of the frame origin.
  errorKm(w, sample, body) {
    const d = this.data, o = (sample * this.bodies + body) * 3, s = sample * this.bodies * 3;
    const p = w.pos, b = 3 * body;
    const dx = (p[b] - p[0]) - (d[o] - d[s]);
    const dy = (p[b + 1] - p[1]) - (d[o + 1] - d[s + 1]);
    const dz = (p[b + 2] - p[2]) - (d[o + 2] - d[s + 2]);
    return Math.hypot(dx, dy, dz) * AU_KM;
  }
  position(sample, body) {
    const o = (sample * this.bodies + body) * 3;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }
}

// ---------- scenarios ----------

// Sun and the eight planetary-system barycentres, DE441 state at J2000.0.
// Not recentred: the DE441 origin includes bodies this model lacks.
export function solarSystem(meta, opts = {}) {
  const w = new World(32);
  meta.planets.forEach((b, i) => w.add(b.name, i === 0 ? "star" : "planet", b.mass, b.state, b.radius_au));
  w.earthIndex = 3;
  const extra = { minor: [], trojans: [] };
  if (opts.minor) for (const b of meta.minor) extra.minor.push(w.add(b.name, b.kind, 0, b.state));
  if (opts.trojans) for (const b of meta.trojans) extra.trojans.push(w.add(b.name, "trojan", 0, b.state));
  return { world: w, epochJD: meta.epoch_jd, ...extra };
}

// Circular restricted three-body problem: Sun, Jupiter on a circular orbit
// and massless particles displaced from L4 and L5.
export function lagrangeIdeal(meta, offsetsDeg = [2, 6, 12]) {
  const mS = meta.planets[0].mass, mJ = meta.planets[5].mass, mu = mJ / (mS + mJ), a = 5.2;
  const n = Math.sqrt(G * (mS + mJ) / (a * a * a));
  const w = new World(16);
  w.add("Sun", "star", mS, [-mu * a, 0, 0, 0, -mu * a * n, 0], meta.planets[0].radius_au);
  w.add("Jupiter", "planet", mJ, [(1 - mu) * a, 0, 0, 0, (1 - mu) * a * n, 0], meta.planets[5].radius_au);
  const ids = [];
  for (const sign of [1, -1])
    for (const off of offsetsDeg) {
      const ang = sign * (60 + off) * Math.PI / 180;
      const x = -mu * a + a * Math.cos(ang), y = a * Math.sin(ang);
      ids.push(w.add(`${sign > 0 ? "L4" : "L5"} +${off}°`, "trojan", 0, [x, y, 0, -n * y, n * x, 0]));
    }
  const theory = (2 * Math.PI / n) / Math.sqrt((1 - Math.sqrt(1 - 27 * mu * (1 - mu))) / 2);
  return { world: w, epochJD: meta.epoch_jd, trojans: ids, jupiter: 1, libTheoryDays: theory,
           jupiterPeriod: 2 * Math.PI / n };
}

// Voyager 2 from 30 days before to 30 days after its Jupiter fly-by.
export function voyager(meta) {
  const v = meta.voyager2, w = new World(16);
  v.bodies.forEach((b, i) => w.add(b.name, i === 0 ? "star" : "planet", b.mass, b.state,
                                   meta.planets[i].radius_au));
  w.earthIndex = 3;
  const probe = w.add("Voyager 2", "probe", 0, v.probe[0]);
  return { world: w, epochJD: v.start_jd, probe, jupiter: 5, ref: v };
}

// Sun + Mercury only, heliocentric, for the two-body precession control.
export function sunMercury(meta) {
  const s = meta.planets[0], m = meta.planets[1], w = new World(4);
  w.add("Sun", "star", s.mass, [0, 0, 0, 0, 0, 0], s.radius_au);
  w.add("Mercury", "planet", 0, m.state.map((x, k) => x - s.state[k]), m.radius_au);
  return { world: w, epochJD: meta.epoch_jd };
}

export function einsteinPrecession(a, e, centralMass) {
  const mu = G * centralMass;
  const perOrbit = 6 * Math.PI * mu / (C_LIGHT * C_LIGHT * a * (1 - e * e));
  const period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
  return toArcsecPerCentury(perOrbit / period);
}

// ---------- simulation with live validation ----------

export class Simulation {
  // opts: world, epochJD, method, dt, forces, reference (or null),
  //       twin (run a Newtonian copy to isolate the 1PN precession),
  //       adaptive (what-if scenarios), blackHole index (or -1)
  constructor(opts) {
    this.world = opts.world;
    this.epochJD = opts.epochJD;
    this.method = opts.method || "yoshida4";
    this.dt = opts.dt || 0.25;
    this.forces = { pn: true, j2: false, emq: true, softening: 0, ...opts.forces };
    this.ref = opts.reference || null;
    this.adaptive = !!opts.adaptive;
    this.hole = opts.hole ?? -1;
    this.holeDrawScale = opts.holeDrawScale || 0;
    this.eaten = [];
    this.lost = 0;
    this.substeps = 0;
    computeAccelerations(this.world, this.forces);
    this.e0 = diagnostics(this.world, this.forces.pn).total;
    this.drift = 0;
    this.maxDrift = 0;

    this.twin = null;
    if (opts.twin && this.forces.pn) {
      this.twin = this.world.clone();
      this.twinForces = { ...this.forces, pn: false };
      computeAccelerations(this.twin, this.twinForces);
    }
    if (this.ref) this._allocSeries();
  }

  _allocSeries() {
    const S = this.ref.samples, nan = () => new Float64Array(S).fill(NaN);
    this.err = PLANET_NAMES.map(nan);     // km, per planet, by sample index
    this.driftSeries = nan();
    this.varpi = nan();                   // Mercury, rad
    this.grVarpi = nan();                 // Mercury 1PN - Newton, rad (unwrapped)
    this.lo = this.hi = this.ref.epochIndex;
    this.maxErr = new Float64Array(PLANET_NAMES.length);
    this._record();
  }

  get jd() { return this.epochJD + this.world.time; }
  get years() { return this.world.time / 365.25; }

  // Advance up to `steps` steps of +-dt. Stops at `untilDays` if given.
  // Returns the number of steps taken.
  advance(steps, dir = 1, untilDays = null) {
    const w = this.world, h = dir * this.dt;
    let done = 0;
    for (; done < steps; done++) {
      if (untilDays !== null && dir * (untilDays - w.time) < this.dt * 0.5) break;
      if (this.adaptive) {
        this.substeps += stepAdaptive(w, h, this.method, this.forces);
        if (this.hole >= 0 && w.alive[this.hole]) {
          const drawn = w.kind[this.hole] === "blackhole"
            ? schwarzschildRadius(w.mass[this.hole]) * this.holeDrawScale : 0;
          const got = processCaptures(w, this.hole, drawn);
          for (const i of got) this.eaten.push(w.name[i]);
        }
      } else {
        step(w, h, this.method, this.forces);
        if (this.twin) step(this.twin, h, this.method, this.twinForces);
      }
      if (this.ref) {
        const k = w.time / this.ref.cadence;
        if (Math.abs(k - Math.round(k)) < 1e-9) this._record();
      }
    }
    if (this.adaptive) this.lost += sanitize(w);
    if (!this.ref) this._energy();
    return done;
  }

  _energy() {
    const e = diagnostics(this.world, this.forces.pn).total;
    this.drift = Math.abs((e - this.e0) / this.e0);
    if (!(this.drift <= this.maxDrift)) this.maxDrift = this.drift;
    return this.drift;
  }

  _record() {
    const ref = this.ref, w = this.world;
    const s = ref.epochIndex + Math.round(w.time / ref.cadence);
    if (s < 0 || s >= ref.samples) return;
    for (let p = 0; p < PLANET_NAMES.length; p++) {
      const e = ref.errorKm(w, s, p + 1);
      this.err[p][s] = e;
      if (!(e <= this.maxErr[p])) this.maxErr[p] = e;
    }
    this.driftSeries[s] = this._energy();
    const v = elements(w, 1, 0).varpi;
    this.varpi[s] = v;
    if (this.twin) {
      let d = v - elements(this.twin, 1, 0).varpi;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      this.grVarpi[s] = d;
    }
    this.lastSample = s;
    if (s < this.lo) this.lo = s;
    if (s > this.hi) this.hi = s;
  }

  // Perihelion advance of Mercury over the visited samples, arcsec/century:
  //   sim    varpi of the simulation, least-squares slope
  //   de441  the same fit over the same dates applied to JPL DE441
  //   gr     slope of (1PN run - Newtonian twin), the relativistic part
  mercuryRates() {
    if (!this.ref || this.hi - this.lo < 3) return null;
    const t = [], a = [], b = [], g = [];
    for (let s = this.lo; s <= this.hi; s++) {
      if (Number.isNaN(this.varpi[s])) continue;
      t.push((s - this.ref.epochIndex) * this.ref.cadence);
      a.push(this.varpi[s]); b.push(this.ref.varpi[s]); g.push(this.grVarpi[s]);
    }
    const out = { sim: toArcsecPerCentury(angleRate(t, a)), de441: toArcsecPerCentury(angleRate(t, b)),
                  spanYears: (t[t.length - 1] - t[0]) / 365.25, gr: null };
    if (this.twin) out.gr = toArcsecPerCentury(angleRate(t, g));
    return out;
  }
}

// Speed of `body` relative to `other`, km/s.
export function relSpeed(w, body, other) {
  const a = 3 * body, b = 3 * other, v = w.vel;
  return Math.hypot(v[a] - v[b], v[a + 1] - v[b + 1], v[a + 2] - v[b + 2]) * KMS_PER_AUD;
}

export function distanceKm(w, body, other) {
  const a = 3 * body, b = 3 * other, p = w.pos;
  return Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]) * AU_KM;
}

// Hyperbolic excess speed of `body` about `planet`, km/s.
export function vInfinity(w, body, planet) {
  const v = relSpeed(w, body, planet) / KMS_PER_AUD;
  const d = distanceKm(w, body, planet) / AU_KM;
  return Math.sqrt(Math.max(0, v * v - 2 * G * w.mass[planet] / d)) * KMS_PER_AUD;
}

// Julian date (TDB) <-> proleptic Gregorian calendar date.
export function jdToDate(jd) {
  const z = Math.floor(jd + 0.5), f = jd + 0.5 - z;
  const alpha = Math.floor((z - 1867216.25) / 36524.25);
  const A = z + 1 + alpha - Math.floor(alpha / 4);
  const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const hours = f * 24;
  return { year, month, day, hour: Math.floor(hours), minute: Math.floor((hours % 1) * 60) };
}

export function dateToJd(year, month, day) {
  const a = Math.floor((14 - month) / 12), y = year + 4800 - a, m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4)
       - Math.floor(y / 100) + Math.floor(y / 400) - 32045 - 0.5;
}

// Measured order of convergence of each integrator on a Kepler orbit
// (a = 0.387 AU, e = 0.2): log2 of the error ratio when the step is halved.
export function measureOrders() {
  const run = (method, dt, days = 64) => {
    const w = new World(2), a = 0.387, e = 0.2, rp = a * (1 - e);
    w.add("central", "star", 1, [0, 0, 0, 0, 0, 0]);
    w.add("probe", "planet", 0, [rp, 0, 0, 0, Math.sqrt(G * (2 / rp - 1 / a)), 0]);
    const cfg = { pn: false };
    computeAccelerations(w, cfg);
    const n = Math.round(days / dt);
    for (let i = 0; i < n; i++) step(w, dt, method, cfg);
    return [w.pos[3], w.pos[4], w.pos[5]];
  };
  const exact = run("yoshida6", 1 / 64);
  const err = (m, dt) => { const p = run(m, dt); return Math.hypot(p[0] - exact[0], p[1] - exact[1], p[2] - exact[2]); };
  const base = { euler: 1 / 16, verlet: 0.5, rk4: 1, yoshida4: 1, yoshida6: 4 };
  const out = {};
  for (const m of Object.keys(base)) out[m] = Math.log2(err(m, base[m]) / err(m, base[m] / 2));
  return out;
}
