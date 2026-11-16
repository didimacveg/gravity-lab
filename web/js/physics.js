// gravity-lab physics, JavaScript port of core/ (C++).
//
// Pure module: no DOM, no globals. The browser app and the Node test suite
// (web/tests/) import the same file, and the tests hold it to the same
// numbers as the C++ validation suite.
//
// Units: AU, days, solar masses. State lives in flat Float64Arrays
// (x0,y0,z0,x1,y1,z1,...) so the inner loops allocate nothing.

export const G = 2.9591220828559e-4;          // Gaussian k^2, AU^3 / (Msun day^2)
export const C_LIGHT = 173.1446326846693;     // AU / day
export const AU_KM = 149597870.7;
export const SECONDS_PER_DAY = 86400;
export const ARCSEC_PER_RADIAN = 206264.806247;
export const DAYS_PER_CENTURY = 36525;
export const KMS_PER_AUD = AU_KM / SECONDS_PER_DAY;

// Averaged Earth-Moon quadrupole, AU^2 (see core/forces.hpp):
// Q = (3/4) mu (1-mu) a^2 (1 + 3e^2/2) (1 - (3/2) sin^2 i)
export const EARTH_MOON_QUADRUPOLE_AU2 = 5.8985e-8;
export const SUN_J2 = 2.2e-7;

export class World {
  constructor(capacity = 32) {
    this.capacity = capacity;
    this.n = 0;
    this.time = 0;                       // days since the scenario epoch
    this.pos = new Float64Array(3 * capacity);
    this.vel = new Float64Array(3 * capacity);
    this.acc = new Float64Array(3 * capacity);
    this.accPN = new Float64Array(3 * capacity);  // velocity-dependent part of acc
    this.mass = new Float64Array(capacity);
    this.radius = new Float64Array(capacity);     // physical radius, AU
    this.alive = new Uint8Array(capacity);
    this.name = [];
    this.kind = [];
    this.earthIndex = -1;                // Earth-Moon barycentre, if present
    this.central = 0;
    this._scratch = null;
  }

  add(name, kind, mass, state, radius = 0) {
    if (this.n === this.capacity) this._grow();
    const i = this.n++;
    for (let k = 0; k < 3; k++) {
      this.pos[3 * i + k] = state[k];
      this.vel[3 * i + k] = state[3 + k];
    }
    this.mass[i] = mass;
    this.radius[i] = radius;
    this.alive[i] = 1;
    this.name[i] = name;
    this.kind[i] = kind;
    this.updateCentral();
    return i;
  }

  _grow() {
    const cap = this.capacity * 2;
    for (const key of ["pos", "vel", "acc", "accPN"]) {
      const a = new Float64Array(3 * cap); a.set(this[key]); this[key] = a;
    }
    for (const key of ["mass", "radius"]) {
      const a = new Float64Array(cap); a.set(this[key]); this[key] = a;
    }
    const al = new Uint8Array(cap); al.set(this.alive); this.alive = al;
    this.capacity = cap;
    this._scratch = null;
  }

  // The dominant mass: centre for the 1PN, J2 and Earth-Moon terms.
  updateCentral() {
    let c = 0, best = -1;
    for (let i = 0; i < this.n; i++)
      if (this.alive[i] && this.mass[i] > best) { best = this.mass[i]; c = i; }
    this.central = c;
  }

  clone() {
    const w = new World(this.capacity);
    w.n = this.n; w.time = this.time;
    w.pos.set(this.pos); w.vel.set(this.vel); w.acc.set(this.acc); w.accPN.set(this.accPN);
    w.mass.set(this.mass); w.radius.set(this.radius); w.alive.set(this.alive);
    w.name = this.name.slice(); w.kind = this.kind.slice();
    w.earthIndex = this.earthIndex; w.central = this.central;
    return w;
  }

  toBarycentric() {
    let m = 0; const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      m += this.mass[i];
      for (let k = 0; k < 3; k++) {
        c[k] += this.mass[i] * this.pos[3 * i + k];
        c[3 + k] += this.mass[i] * this.vel[3 * i + k];
      }
    }
    if (!(m > 0)) return;
    for (let i = 0; i < this.n; i++)
      for (let k = 0; k < 3; k++) {
        this.pos[3 * i + k] -= c[k] / m;
        this.vel[3 * i + k] -= c[3 + k] / m;
      }
  }
}

export const defaultForces = () => ({ pn: false, j2: false, emq: false, softening: 0 });

// 1PN term for every body, using positions of `w` and velocities `vel`
// (Verlet evaluates it at the half-step velocity). Dominant-central-body
// form of the Einstein-Infeld-Hoffmann equations:
//   a = GM/(c^2 r^3) [ (4GM/r - v^2) r + 4 (r.v) v ]
function compute1PN(w, vel, out) {
  const { pos, mass, alive, n } = w, c = w.central;
  const mu = G * mass[c], c2 = C_LIGHT * C_LIGHT, lim = 1e-3 * mass[c];
  const cx = pos[3 * c], cy = pos[3 * c + 1], cz = pos[3 * c + 2];
  const cvx = vel[3 * c], cvy = vel[3 * c + 1], cvz = vel[3 * c + 2];
  for (let i = 0; i < n; i++) {
    const o = 3 * i;
    out[o] = out[o + 1] = out[o + 2] = 0;
    if (i === c || !alive[i] || mass[i] > lim) continue;
    const rx = pos[o] - cx, ry = pos[o + 1] - cy, rz = pos[o + 2] - cz;
    const vx = vel[o] - cvx, vy = vel[o + 1] - cvy, vz = vel[o + 2] - cvz;
    const r2 = rx * rx + ry * ry + rz * rz;
    if (!(r2 > 0)) continue;
    const r = Math.sqrt(r2);
    const pre = mu / (c2 * r2 * r);
    const f = pre * (4 * mu / r - (vx * vx + vy * vy + vz * vz));
    const g = pre * 4 * (rx * vx + ry * vy + rz * vz);
    out[o] = f * rx + g * vx; out[o + 1] = f * ry + g * vy; out[o + 2] = f * rz + g * vz;
  }
}

// All accelerations from the current state, before anything moves.
// Each pair is visited once and applied to both bodies with opposite sign:
// Newton's third law by construction.
export function computeAccelerations(w, cfg) {
  const { pos, acc, mass, alive, n } = w;
  acc.fill(0, 0, 3 * n);
  const eps2 = cfg.softening ? cfg.softening * cfg.softening : 0;

  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const mi = mass[i], oi = 3 * i;
    const xi = pos[oi], yi = pos[oi + 1], zi = pos[oi + 2];
    let ax = 0, ay = 0, az = 0;
    for (let j = i + 1; j < n; j++) {
      const mj = mass[j];
      if (!alive[j] || (mi === 0 && mj === 0)) continue;   // tracers do not attract
      const oj = 3 * j;
      const dx = pos[oj] - xi, dy = pos[oj + 1] - yi, dz = pos[oj + 2] - zi;
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      if (!(r2 > 0)) continue;
      const inv = G / (r2 * Math.sqrt(r2));
      const si = mj * inv, sj = mi * inv;
      ax += dx * si; ay += dy * si; az += dz * si;
      acc[oj] -= dx * sj; acc[oj + 1] -= dy * sj; acc[oj + 2] -= dz * sj;
    }
    acc[oi] += ax; acc[oi + 1] += ay; acc[oi + 2] += az;
  }

  const c = w.central, oc = 3 * c;
  if (cfg.j2) {
    // Solar oblateness. The Sun's pole is taken along the ecliptic normal.
    const R = w.radius[c], mu = G * mass[c];
    for (let i = 0; i < n; i++) {
      if (i === c || !alive[i]) continue;
      const o = 3 * i;
      const dx = pos[o] - pos[oc], dy = pos[o + 1] - pos[oc + 1], dz = pos[o + 2] - pos[oc + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (!(r2 > 0)) continue;
      const r = Math.sqrt(r2);
      const k = -1.5 * SUN_J2 * mu * R * R / (r2 * r2 * r);
      const z2 = 5 * dz * dz / r2;
      acc[o] += k * dx * (1 - z2); acc[o + 1] += k * dy * (1 - z2); acc[o + 2] += k * dz * (3 - z2);
    }
  }

  const e = w.earthIndex;
  if (cfg.emq && e >= 0 && e !== c && alive[e]) {
    // The Sun pulls on Earth and Moon separately; averaged over a month the
    // difference from pulling on their barycentre is a radial 1/r^4 term.
    const o = 3 * e;
    const dx = pos[o] - pos[oc], dy = pos[o + 1] - pos[oc + 1], dz = pos[o + 2] - pos[oc + 2];
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 > 0) {
      const k = -EARTH_MOON_QUADRUPOLE_AU2 * G * mass[c] / (r2 * r2 * Math.sqrt(r2));
      const back = mass[e] / mass[c];
      acc[o] += k * dx; acc[o + 1] += k * dy; acc[o + 2] += k * dz;
      acc[oc] -= k * dx * back; acc[oc + 1] -= k * dy * back; acc[oc + 2] -= k * dz * back;
    }
  }

  if (cfg.pn) {
    compute1PN(w, w.vel, w.accPN);
    const pn = w.accPN;
    for (let k = 0; k < 3 * n; k++) acc[k] += pn[k];
  } else {
    w.accPN.fill(0, 0, 3 * n);
  }
}

function scratch(w) {
  if (!w._scratch || w._scratch.cap !== w.capacity) {
    const m = 3 * w.capacity;
    w._scratch = { cap: w.capacity, a: new Float64Array(m), b: new Float64Array(m),
                   c: new Float64Array(m), k: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Float64Array(m)) };
  }
  return w._scratch;
}

// Velocity Verlet, kick-drift-kick. With the velocity-dependent 1PN term
// both half kicks evaluate it at the half-step velocity:
//   v_h = v_0 + (dt/2) [a_N(x_0) + a_PN(x_0, v_h)]      (implicit, fixed point)
//   x_1 = x_0 + dt v_h
//   v_1 = v_h + (dt/2) [a_N(x_1) + a_PN(x_1, v_h)]
// which keeps the step time-reversible and second order. Using the stored
// acceleration from the previous step instead drops the method to first
// order; see tests/test_integrators.cpp.
function verlet(w, dt, cfg) {
  const { pos, vel, acc, n } = w, m = 3 * n, h = 0.5 * dt;
  if (cfg.pn) {
    const s = scratch(w), aN = s.a, vh = s.b, pn = s.c;
    for (let k = 0; k < m; k++) { aN[k] = acc[k] - w.accPN[k]; pn[k] = w.accPN[k]; }
    for (let it = 0; it < 3; it++) {
      for (let k = 0; k < m; k++) vh[k] = vel[k] + (aN[k] + pn[k]) * h;
      compute1PN(w, vh, pn);
    }
    for (let k = 0; k < m; k++) vel[k] += (aN[k] + pn[k]) * h;
  } else {
    for (let k = 0; k < m; k++) vel[k] += acc[k] * h;
  }
  for (let k = 0; k < m; k++) pos[k] += vel[k] * dt;
  computeAccelerations(w, cfg);
  for (let k = 0; k < m; k++) vel[k] += acc[k] * h;
}

function euler(w, dt, cfg) {
  computeAccelerations(w, cfg);
  const { pos, vel, acc, n } = w;
  for (let k = 0; k < 3 * n; k++) { pos[k] += vel[k] * dt; vel[k] += acc[k] * dt; }
}

function rk4(w, dt, cfg) {
  const { pos, vel, acc, n } = w, m = 3 * n, s = scratch(w);
  const x0 = s.a, v0 = s.b, kx = s.k, kv = s.k;
  x0.set(pos.subarray(0, m)); v0.set(vel.subarray(0, m));
  for (let st = 0; st < 4; st++) {
    if (st > 0) {
      const f = st < 3 ? 0.5 * dt : dt;
      for (let k = 0; k < m; k++) {
        pos[k] = x0[k] + kx[2 * (st - 1)][k] * f;
        vel[k] = v0[k] + kv[2 * (st - 1) + 1][k] * f;
      }
    }
    computeAccelerations(w, cfg);
    kx[2 * st].set(vel.subarray(0, m)); kv[2 * st + 1].set(acc.subarray(0, m));
  }
  for (let k = 0; k < m; k++) {
    pos[k] = x0[k] + (kx[0][k] + 2 * kx[2][k] + 2 * kx[4][k] + kx[6][k]) * (dt / 6);
    vel[k] = v0[k] + (kv[1][k] + 2 * kv[3][k] + 2 * kv[5][k] + kv[7][k]) * (dt / 6);
  }
  computeAccelerations(w, cfg);
}

const CBRT2 = Math.cbrt(2);
const Y4_W1 = 1 / (2 - CBRT2), Y4_W0 = -CBRT2 * Y4_W1;
// Yoshida (1990), sixth order, solution A.
const Y6_W1 = -1.17767998417887, Y6_W2 = 0.235573213359357, Y6_W3 = 0.784513610477560;
const Y6_W0 = 1 - 2 * (Y6_W1 + Y6_W2 + Y6_W3);
const Y6 = [Y6_W3, Y6_W2, Y6_W1, Y6_W0, Y6_W1, Y6_W2, Y6_W3];

export const INTEGRATORS = {
  euler:    { order: 1, symplectic: false, evals: 1 },
  rk4:      { order: 4, symplectic: false, evals: 4 },
  verlet:   { order: 2, symplectic: true, evals: 1 },
  yoshida4: { order: 4, symplectic: true, evals: 3 },
  yoshida6: { order: 6, symplectic: true, evals: 7 },
};

// One step. The caller must have called computeAccelerations once before
// the first step (Verlet reuses the acceleration left by the previous one).
export function step(w, dt, method, cfg) {
  const t0 = w.time;
  switch (method) {
    case "euler": euler(w, dt, cfg); break;
    case "rk4": rk4(w, dt, cfg); break;
    case "verlet": verlet(w, dt, cfg); break;
    case "yoshida6": for (let i = 0; i < 7; i++) verlet(w, Y6[i] * dt, cfg); break;
    default:
      // Three Verlet steps; the middle one runs BACKWARDS in time.
      verlet(w, Y4_W1 * dt, cfg); verlet(w, Y4_W0 * dt, cfg); verlet(w, Y4_W1 * dt, cfg);
  }
  w.time = t0 + dt;
}

// Smallest dynamical timescale of the system, days.
export function safeStep(w, eta = 0.02) {
  let dt = Infinity;
  const { pos, vel, acc, mass, alive, n } = w;
  for (let i = 0; i < n; i++) {
    if (!alive[i] || !(mass[i] > 0)) continue;
    const o = 3 * i;
    const a = Math.hypot(acc[o], acc[o + 1], acc[o + 2]);
    const v = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
    if (a > 0 && v > 0) dt = Math.min(dt, eta * v / a);
    for (let j = i + 1; j < n; j++) {
      if (!alive[j] || !(mass[j] > 0)) continue;
      const p = 3 * j;
      const r = Math.hypot(pos[p] - pos[o], pos[p + 1] - pos[o + 1], pos[p + 2] - pos[o + 2]);
      if (r > 0) dt = Math.min(dt, eta * Math.sqrt(r * r * r / (G * (mass[i] + mass[j]))));
    }
  }
  return Number.isFinite(dt) && dt > 0 ? dt : 1e-6;
}

// Advance dtTarget, subdividing by safeStep. Returns the substeps used; the
// budget bounds the work so a violent encounter slows the run instead of
// hanging it.
export function stepAdaptive(w, dtTarget, method, cfg, budget = 3000) {
  let left = dtTarget, used = 0;
  while (left > dtTarget * 1e-9 && used < budget) {
    const h = Math.min(left, safeStep(w));
    step(w, h, method, cfg);
    left -= h; used++;
  }
  return used;
}

// Retire bodies whose state stopped being finite or that left the scene.
export function sanitize(w, maxRadius = 1e5) {
  let removed = 0;
  for (let i = 0; i < w.n; i++) {
    if (!w.alive[i]) continue;
    const o = 3 * i;
    let ok = true;
    for (let k = 0; k < 3; k++)
      ok = ok && Number.isFinite(w.pos[o + k]) && Number.isFinite(w.vel[o + k]);
    if (!ok || Math.hypot(w.pos[o], w.pos[o + 1], w.pos[o + 2]) > maxRadius) {
      w.alive[i] = 0; removed++;
      for (let k = 0; k < 3; k++) { w.pos[o + k] = 0; w.vel[o + k] = 0; }
      w.mass[i] = 0;
    }
  }
  if (removed) w.updateCentral();
  return removed;
}

// With `pn` true the total includes the 1PN energy of each light body
// about the central mass (harmonic gauge),
//   m/c^2 [ 3 v^4/8 + 3 GM v^2/(2r) + (GM)^2/(2 r^2) ],
// without which the "energy" oscillates at 1e-9 and hides the integrator.
export function diagnostics(w, pn = false) {
  const { pos, vel, mass, alive, n } = w;
  let ke = 0, pe = 0, lx = 0, ly = 0, lz = 0, px = 0, py = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    if (!alive[i] || mass[i] === 0) continue;
    const o = 3 * i, m = mass[i];
    const x = pos[o], y = pos[o + 1], z = pos[o + 2], vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
    ke += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    px += m * vx; py += m * vy; pz += m * vz;
    lx += m * (y * vz - z * vy); ly += m * (z * vx - x * vz); lz += m * (x * vy - y * vx);
    for (let j = i + 1; j < n; j++) {
      if (!alive[j] || mass[j] === 0) continue;
      const p = 3 * j;
      const r = Math.hypot(pos[p] - x, pos[p + 1] - y, pos[p + 2] - z);
      if (r > 0) pe -= G * m * mass[j] / r;
    }
  }
  let epn = 0;
  if (pn) {
    const c = w.central, q = 3 * c, mu = G * mass[c], c2 = C_LIGHT * C_LIGHT;
    for (let i = 0; i < n; i++) {
      if (i === c || !alive[i] || mass[i] === 0 || mass[i] > 1e-3 * mass[c]) continue;
      const o = 3 * i;
      const r = Math.hypot(pos[o] - pos[q], pos[o + 1] - pos[q + 1], pos[o + 2] - pos[q + 2]);
      const v2 = (vel[o] - vel[q]) ** 2 + (vel[o + 1] - vel[q + 1]) ** 2 + (vel[o + 2] - vel[q + 2]) ** 2;
      if (r > 0) epn += mass[i] * (0.375 * v2 * v2 + 1.5 * mu * v2 / r + 0.5 * mu * mu / (r * r)) / c2;
    }
  }
  return { ke, pe, epn, total: ke + pe + epn, L: Math.hypot(lx, ly, lz), p: Math.hypot(px, py, pz) };
}

const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// Osculating elements of body i about body c.
//   varpi      = Omega + omega, the longitude of perihelion ephemerides tabulate
//   projected  = perihelion direction projected on the ecliptic (what the
//                original tests measure; 0.4% slower for Mercury)
export function elements(w, i, c = w.central) {
  const { pos, vel, mass } = w, o = 3 * i, q = 3 * c;
  const rx = pos[o] - pos[q], ry = pos[o + 1] - pos[q + 1], rz = pos[o + 2] - pos[q + 2];
  const vx = vel[o] - vel[q], vy = vel[o + 1] - vel[q + 1], vz = vel[o + 2] - vel[q + 2];
  const mu = G * (mass[c] + mass[i]);
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz;
  const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
  // Laplace-Runge-Lenz: e = (v x h)/mu - r/|r|. Constant in two-body
  // Newtonian gravity; its rotation is what "precession" means.
  const ex = (vy * hz - vz * hy) / mu - rx / r;
  const ey = (vz * hx - vx * hz) / mu - ry / r;
  const ez = (vx * hy - vy * hx) / mu - rz / r;
  const e = Math.hypot(ex, ey, ez), h = Math.hypot(hx, hy, hz);
  const a = 1 / (2 / r - v2 / mu);
  const nx = -hy, ny = hx, nn = Math.hypot(nx, ny);
  let varpi = Math.atan2(ey, ex), node = 0, argPeri = 0;
  if (nn > 0 && e > 0) {
    node = Math.atan2(ny, nx);
    argPeri = Math.acos(Math.max(-1, Math.min(1, (nx * ex + ny * ey) / (nn * e))));
    if (ez < 0) argPeri = 2 * Math.PI - argPeri;
    varpi = node + argPeri;
  }
  return {
    a, e, inc: Math.acos(Math.max(-1, Math.min(1, hz / h))), node, argPeri, varpi,
    projected: Math.atan2(ey, ex), evec: [ex, ey, ez], h: [hx, hy, hz],
    r, speed: Math.sqrt(v2), period: a > 0 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity,
    energy: 0.5 * v2 - mu / r,
  };
}

// Least-squares slope of an angle series, unwrapping 2 pi jumps.
export function angleRate(times, angles) {
  const n = times.length;
  if (n < 2) return 0;
  let prev = angles[0], st = 0, sa = 0, stt = 0, sta = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) prev += wrap(angles[i] - prev);
    st += times[i]; sa += prev; stt += times[i] * times[i]; sta += times[i] * prev;
  }
  const den = n * stt - st * st;
  return den === 0 ? 0 : (n * sta - st * sa) / den;
}

export const toArcsecPerCentury = (radPerDay) => radPerDay * ARCSEC_PER_RADIAN * DAYS_PER_CENTURY;

// Angle (degrees) by which `body` leads `planet`, seen from `sun`, in the
// ecliptic. L4 is +60, L5 is -60.
export function leadAngle(w, body, planet, sun = 0) {
  const p = w.pos, s = 3 * sun, a = 3 * planet, b = 3 * body;
  const d = Math.atan2(p[b + 1] - p[s + 1], p[b] - p[s]) - Math.atan2(p[a + 1] - p[s + 1], p[a] - p[s]);
  return wrap(d) * 180 / Math.PI;
}

// ---------- black holes: only used by the "what if" scenarios ----------

export const schwarzschildRadius = (m) => 2 * G * m / (C_LIGHT * C_LIGHT);

// Closest approach of the encounter orbit:
//   e = sqrt(1 + 2 E L^2 / mu^2),  r_p = (L^2/mu) / (1 + e)
export function pericenterDistance(rx, ry, rz, vx, vy, vz, mu) {
  const rn = Math.hypot(rx, ry, rz);
  if (!(rn > 0) || !(mu > 0)) return 0;
  const lx = ry * vz - rz * vy, ly = rz * vx - rx * vz, lz = rx * vy - ry * vx;
  const l2 = lx * lx + ly * ly + lz * lz;
  if (!(l2 > 0)) return 0;
  const E = 0.5 * (vx * vx + vy * vy + vz * vz) - mu / rn;
  const e = Math.sqrt(Math.max(0, 1 + 2 * E * l2 / (mu * mu)));
  return (l2 / mu) / (1 + e);
}

// Absorb bodies whose encounter orbit dips inside the innermost stable
// circular orbit (3 r_s). The test is where the body is GOING, not where it
// is: between two steps a fast body crosses the whole horizon unrecorded.
// minRadius forces a larger capture radius, used only when the horizon is
// drawn magnified so that what is shown and what is simulated agree.
export function processCaptures(w, h, minRadius = 0) {
  const eaten = [];
  if (!w.alive[h]) return eaten;
  const { pos, vel, mass } = w, q = 3 * h;
  for (let i = 0; i < w.n; i++) {
    if (i === h || !w.alive[i]) continue;
    const o = 3 * i;
    const rx = pos[o] - pos[q], ry = pos[o + 1] - pos[q + 1], rz = pos[o + 2] - pos[q + 2];
    const ux = vel[o] - vel[q], uy = vel[o + 1] - vel[q + 1], uz = vel[o + 2] - vel[q + 2];
    const d = Math.hypot(rx, ry, rz);
    const rc = Math.max(3 * schwarzschildRadius(mass[h]), minRadius);
    const rp = pericenterDistance(rx, ry, rz, ux, uy, uz, G * (mass[h] + mass[i]));
    const inbound = rx * ux + ry * uy + rz * uz < 0;
    if (!(rp <= rc && (inbound || d <= rc))) continue;
    // With the physical radius, a body on a plunging orbit is taken once it
    // is close (it cannot escape). With a magnified, drawn radius it is
    // taken when it reaches the disc that is on screen, not before.
    const rcPhys = 3 * schwarzschildRadius(mass[h]);
    if (d > (minRadius > rcPhys ? 1.2 * rc : 200 * rc)) continue;
    const M = mass[h] + mass[i];
    for (let k = 0; k < 3; k++) {           // momentum-conserving merge
      vel[q + k] = (vel[q + k] * mass[h] + vel[o + k] * mass[i]) / M;
      vel[o + k] = 0; pos[o + k] = 0;
    }
    mass[h] = M; mass[i] = 0;
    w.alive[i] = 0;
    eaten.push(i);
  }
  if (eaten.length) w.updateCentral();
  return eaten;
}
