// 3D view on a 2D canvas: orbit camera, perspective projection, ecliptic
// grid, celestial sphere. Twenty bodies and a few thousand line segments do
// not need WebGL, and a 2D context works everywhere and costs no dependency.
import { CLASS_COLORS, starRadius, starAlpha } from "./sky.js";
import { elements, schwarzschildRadius } from "./physics.js";

export const PLANET_COLORS = {
  Mercury: "#9085e9", Venus: "#e66767", Earth: "#3987e5", Mars: "#d95926",
  Jupiter: "#199e70", Saturn: "#c98500", Uranus: "#d55181", Neptune: "#0ca30c",
};
const KIND_STYLE = {
  star: { r: 7, color: "#ffd98a" },
  planet: { r: 3.4, color: "#a9b6c9" },
  dwarf: { r: 2.3, color: "#8b97aa" },
  asteroid: { r: 2.0, color: "#7d8799" },
  centaur: { r: 2.0, color: "#7d8799" },
  comet: { r: 2.2, color: "#9fd8e6" },
  trojan: { r: 2.4, color: "#7fd4ff" },
  probe: { r: 3.2, color: "#ffffff" },
  blackhole: { r: 5, color: "#000000" },
  intruder: { r: 6, color: "#ffe08a" },
};
const GIANTS = new Set(["Jupiter", "Saturn", "Uranus", "Neptune"]);
const RINGS_AU = [1, 2, 5, 10, 20, 30, 50, 100];
const TRAIL = 700;
const LOG_R0 = 0.25, LOG_K = 10;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cam = { yaw: -1.05, pitch: 0.62, dist: 16, target: [0, 0, 0], fov: 0.8 };
    this.scale = "linear";
    this.show = { orbits: true, trails: true, labels: true, stars: true, starNames: true, grid: true };
    this.sky = null;
    this.maxStarMag = 5.5;
    this.origin = 0;          // body the view is centred on
    this.rotateWith = -1;     // body whose orbital angle is subtracted (co-rotating frame)
    this.focus = -1;          // body the camera target follows
    this.selected = -1;
    this.trails = [];
    this.orbitCache = [];
    this.orbitAge = 1e9;
    this.screen = [];         // last projected bodies, for picking
    this.holeScale = 0;
    this.colorOf = new Map();  // per-body colour overrides (experiments)
    this.trailOnly = null;    // Set of body kinds that leave a trail, or null for all
    this.nameOf = (n) => n;
    this.gridLabel = (au) => `${au} AU`;
    this.dprCap = 2;          // lowered by the app if frames run slow
    this.markers = [];        // extra points: {pos:[x,y,z] (AU, origin frame), label, color}
    this.resize();
  }

  resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, this.dprCap);
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.dpr = dpr;
  }

  reset(world) {
    this.trails = [];
    for (let i = 0; i < world.n; i++) this.trails.push({ buf: new Float32Array(3 * TRAIL), head: 0, len: 0 });
    this.orbitCache = [];
    this.orbitAge = 1e9;
    this.screen = [];
  }

  clearTrails() { for (const t of this.trails) { t.head = 0; t.len = 0; } this.orbitAge = 1e9; }

  // World position -> view-frame position in AU (before radial scaling).
  frame(world, i, out) {
    const p = world.pos, o = 3 * this.origin;
    let x = p[3 * i] - p[o], y = p[3 * i + 1] - p[o + 1];
    const z = p[3 * i + 2] - p[o + 2];
    if (this.rotateWith >= 0) {
      const c = 3 * world.central, r = 3 * this.rotateWith;
      const a = -Math.atan2(p[r + 1] - p[c + 1], p[r] - p[c]);
      const ca = Math.cos(a), sa = Math.sin(a), x0 = x;
      x = x0 * ca - y * sa; y = x0 * sa + y * ca;
    }
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  }

  // Radial scaling. Log mode compresses distance from the origin so that
  // Mercury and Neptune fit in one view; directions are preserved.
  scaleRadius(r) { return this.scale === "log" ? LOG_K * Math.log10(1 + r / LOG_R0) : r; }
  map(v, out) {
    if (this.scale !== "log") { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
    const r = Math.hypot(v[0], v[1], v[2]);
    const k = r > 0 ? this.scaleRadius(r) / r : 0;
    out[0] = v[0] * k; out[1] = v[1] * k; out[2] = v[2] * k;
    return out;
  }

  _basis() {
    const { yaw, pitch, dist, target } = this.cam;
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    this.eye = [target[0] + dist * cp * cy, target[1] + dist * cp * sy, target[2] + dist * sp];
    this.f = [-cp * cy, -cp * sy, -sp];
    this.r = [-sy, cy, 0];                                   // f x z, normalised
    this.u = [-sp * cy, -sp * sy, cp];                       // r x f
    this.F = 0.5 * Math.min(this.W, this.H * 1.25) / Math.tan(this.cam.fov / 2);
  }

  // View-space coordinates of a display-space point. Returns depth (<=0 behind).
  _view(p, out) {
    const dx = p[0] - this.eye[0], dy = p[1] - this.eye[1], dz = p[2] - this.eye[2];
    out[0] = dx * this.r[0] + dy * this.r[1];
    out[1] = dx * this.u[0] + dy * this.u[1] + dz * this.u[2];
    out[2] = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    return out[2];
  }
  _toScreen(v, out) {
    out[0] = this.W / 2 + this.F * v[0] / v[2];
    out[1] = this.H / 2 - this.F * v[1] / v[2];
    return out;
  }

  // Polyline in display space with near-plane clipping.
  _polyline(pts, count, closed) {
    const ctx = this.ctx, near = Math.max(1e-4, this.cam.dist * 0.01);
    const a = [0, 0, 0], b = [0, 0, 0], s = [0, 0], q = [0, 0, 0];
    let pen = false;
    const total = closed ? count + 1 : count;
    for (let k = 0; k < total; k++) {
      const i = (k % count) * 3;
      q[0] = pts[i]; q[1] = pts[i + 1]; q[2] = pts[i + 2];
      this._view(q, b);
      if (k > 0) {
        const ina = a[2] > near, inb = b[2] > near;
        if (ina && inb) {
          if (!pen) { this._toScreen(a, s); ctx.moveTo(s[0], s[1]); }
          this._toScreen(b, s); ctx.lineTo(s[0], s[1]); pen = true;
        } else if (ina !== inb) {
          const t = (near - a[2]) / (b[2] - a[2]);
          const c = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), near];
          if (ina) {
            if (!pen) { this._toScreen(a, s); ctx.moveTo(s[0], s[1]); }
            this._toScreen(c, s); ctx.lineTo(s[0], s[1]); pen = false;
          } else {
            this._toScreen(c, s); ctx.moveTo(s[0], s[1]);
            this._toScreen(b, s); ctx.lineTo(s[0], s[1]); pen = true;
          }
        } else pen = false;
      }
      a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
    }
  }

  styleOf(world, i) {
    const kind = world.kind[i], name = world.name[i];
    const base = KIND_STYLE[kind] || KIND_STYLE.planet;
    let color = this.colorOf.get(i) || PLANET_COLORS[name] || base.color, r = base.r;
    if (GIANTS.has(name)) r = 4.6;
    return { color, r };
  }

  // Record the current positions into the trails.
  pushTrails(world) {
    const v = [0, 0, 0];
    for (let i = 0; i < world.n && i < this.trails.length; i++) {
      if (!world.alive[i] || (this.trailOnly && !this.trailOnly.has(world.kind[i]))) continue;
      const t = this.trails[i];
      this.frame(world, i, v);
      t.buf[3 * t.head] = v[0]; t.buf[3 * t.head + 1] = v[1]; t.buf[3 * t.head + 2] = v[2];
      t.head = (t.head + 1) % TRAIL;
      if (t.len < TRAIL) t.len++;
    }
  }

  _orbits(world) {
    if (this.orbitAge++ < 20 && this.orbitCache.length === world.n) return;
    this.orbitAge = 0;
    const N = 96, c = world.central;
    this.orbitCache = [];
    for (let i = 0; i < world.n; i++) {
      this.orbitCache[i] = null;
      if (i === c || !world.alive[i] || world.kind[i] === "probe" || world.kind[i] === "blackhole" ||
          world.kind[i] === "intruder") continue;
      const el = elements(world, i, c);
      if (!(el.e < 0.999) || !(el.a > 0) || el.a > 500) continue;
      const e = el.e, ex = el.evec[0] / e, ey = el.evec[1] / e, ez = el.evec[2] / e;
      const hn = Math.hypot(...el.h), hx = el.h[0] / hn, hy = el.h[1] / hn, hz = el.h[2] / hn;
      const qx = hy * ez - hz * ey, qy = hz * ex - hx * ez, qz = hx * ey - hy * ex;
      const b = el.a * Math.sqrt(1 - e * e);
      const pts = new Float32Array(3 * N);
      // Centre on the origin body (orbits are about the central body).
      const off = [world.pos[3 * c] - world.pos[3 * this.origin],
                   world.pos[3 * c + 1] - world.pos[3 * this.origin + 1],
                   world.pos[3 * c + 2] - world.pos[3 * this.origin + 2]];
      const tmp = [0, 0, 0], m = [0, 0, 0];
      for (let k = 0; k < N; k++) {
        const E = 2 * Math.PI * k / N, cx = el.a * (Math.cos(E) - e), sx = b * Math.sin(E);
        tmp[0] = off[0] + cx * ex + sx * qx; tmp[1] = off[1] + cx * ey + sx * qy; tmp[2] = off[2] + cx * ez + sx * qz;
        this.map(tmp, m);
        pts[3 * k] = m[0]; pts[3 * k + 1] = m[1]; pts[3 * k + 2] = m[2];
      }
      // Perihelion point, used by the Mercury experiment.
      tmp[0] = off[0] + el.a * (1 - e) * ex; tmp[1] = off[1] + el.a * (1 - e) * ey; tmp[2] = off[2] + el.a * (1 - e) * ez;
      this.orbitCache[i] = { pts, peri: this.map(tmp, [0, 0, 0]) };
    }
  }

  draw(world, opts = {}) {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, W, H);

    const v = [0, 0, 0], m = [0, 0, 0], vw = [0, 0, 0], s = [0, 0];
    if (this.focus >= 0 && this.focus < world.n && world.alive[this.focus]) {
      this.map(this.frame(world, this.focus, v), m);
      this.cam.target = [m[0], m[1], m[2]];
    }
    this._basis();

    if (this.show.stars && this.sky) this._stars();
    if (this.show.grid && this.origin === world.central) this._grid();

    ctx.lineWidth = 1;
    if (this.show.orbits && this.rotateWith < 0) {
      this._orbits(world);
      for (let i = 0; i < world.n; i++) {
        const o = this.orbitCache[i];
        if (!o) continue;
        ctx.beginPath();
        this._polyline(o.pts, o.pts.length / 3, true);
        ctx.strokeStyle = this.styleOf(world, i).color;
        ctx.globalAlpha = i === this.selected ? 0.8 : 0.32;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (this.show.trails) {
      const pts = new Float32Array(3 * TRAIL);
      for (let i = 0; i < world.n && i < this.trails.length; i++) {
        const t = this.trails[i];
        if (t.len < 2 || !world.alive[i]) continue;
        for (let k = 0; k < t.len; k++) {
          const j = 3 * ((t.head - t.len + k + TRAIL) % TRAIL);
          v[0] = t.buf[j]; v[1] = t.buf[j + 1]; v[2] = t.buf[j + 2];
          this.map(v, m);
          pts[3 * k] = m[0]; pts[3 * k + 1] = m[1]; pts[3 * k + 2] = m[2];
        }
        ctx.beginPath();
        this._polyline(pts, t.len, false);
        ctx.strokeStyle = this.styleOf(world, i).color;
        ctx.globalAlpha = world.kind[i] === "probe" ? 0.95 : 0.6;
        ctx.lineWidth = world.kind[i] === "probe" ? 1.6 : 1.1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }

    // Perihelion marker of the highlighted body.
    if (opts.perihelionOf >= 0 && this.orbitCache[opts.perihelionOf]) {
      const o = this.orbitCache[opts.perihelionOf];
      const c0 = this.map(this.frame(world, world.central, v), [0, 0, 0]);
      const line = new Float32Array([c0[0], c0[1], c0[2], o.peri[0], o.peri[1], o.peri[2]]);
      ctx.beginPath(); this._polyline(line, 2, false);
      ctx.strokeStyle = "#7fd4ff"; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      if (this._view(o.peri, vw) > 0) {
        this._toScreen(vw, s);
        ctx.fillStyle = "#7fd4ff"; ctx.beginPath(); ctx.arc(s[0], s[1], 2.5, 0, 6.3); ctx.fill();
        this._label(opts.perihelionLabel || "perihelion", s[0] + 7, s[1] - 7, "#7fd4ff");
      }
    }

    for (const mk of this.markers) {
      this.map(mk.pos, m);
      if (this._view(m, vw) <= 0) continue;
      this._toScreen(vw, s);
      ctx.strokeStyle = mk.color || "#7fd4ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s[0] - 5, s[1]); ctx.lineTo(s[0] + 5, s[1]);
      ctx.moveTo(s[0], s[1] - 5); ctx.lineTo(s[0], s[1] + 5); ctx.stroke();
      this._label(mk.label, s[0] + 8, s[1] - 6, mk.color || "#7fd4ff");
    }

    // Bodies, far to near.
    this.screen = [];
    for (let i = 0; i < world.n; i++) {
      if (!world.alive[i]) continue;
      this.map(this.frame(world, i, v), m);
      if (this._view(m, vw) <= this.cam.dist * 0.01) continue;
      this._toScreen(vw, s);
      this.screen.push({ i, x: s[0], y: s[1], z: vw[2] });
    }
    this.screen.sort((a, b) => b.z - a.z);
    ctx.font = "11px 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    const pending = [];
    for (const b of this.screen) {
      const st = this.styleOf(world, b.i), kind = world.kind[b.i];
      if (b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) continue;
      if (kind === "star" || kind === "intruder") {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, st.r * 4);
        g.addColorStop(0, "rgba(255,217,138,.55)"); g.addColorStop(1, "rgba(255,217,138,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, st.r * 4, 0, 6.3); ctx.fill();
      }
      if (kind === "blackhole") {
        const rs = schwarzschildRadius(world.mass[b.i]) * (this.holeScale || 1);
        const px = Math.max(4, this.F * rs / b.z);
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(b.x, b.y, px, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "#ffb86b"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
      } else if (kind === "probe") {
        ctx.fillStyle = st.color; ctx.beginPath();
        ctx.moveTo(b.x, b.y - 4); ctx.lineTo(b.x + 4, b.y); ctx.lineTo(b.x, b.y + 4); ctx.lineTo(b.x - 4, b.y);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(b.x, b.y, st.r, 0, 6.3); ctx.fill();
      }
      if (b.i === this.selected) {
        ctx.strokeStyle = "#7fd4ff"; ctx.beginPath(); ctx.arc(b.x, b.y, st.r + 5, 0, 6.3); ctx.stroke();
      }
      if (this.show.labels && (kind !== "trojan" || b.i === this.selected || opts.labelAll))
        pending.push({ text: this.nameOf(world.name[b.i]), x: b.x, y: b.y, r: st.r, z: b.z, sel: b.i === this.selected });
    }
    // Labels: nearest bodies first; a label that would cover another one
    // moves to the left of its body, and is dropped if that fails too.
    pending.sort((a, b) => (b.sel - a.sel) || (a.z - b.z));
    const placed = [];
    for (const l of pending) {
      const w = ctx.measureText(l.text).width;
      for (const x of [l.x + l.r + 5, l.x - l.r - 5 - w]) {
        const box = [x - 2, l.y - 8, x + w + 2, l.y + 6];
        if (placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) continue;
        placed.push(box);
        this._label(l.text, x, l.y + 4, l.sel ? "#e8eef7" : "#93a1b5");
        break;
      }
    }
  }

  _label(text, x, y, color) {
    const ctx = this.ctx;
    ctx.font = "11px 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  _grid() {
    const ctx = this.ctx, N = 120, pts = new Float32Array(3 * N), s = [0, 0], vw = [0, 0, 0];
    const reach = this.cam.dist * 3;
    ctx.strokeStyle = "rgba(76,157,255,.16)"; ctx.lineWidth = 1;
    let outer = 0;
    for (const au of RINGS_AU) {
      const R = this.scaleRadius(au);
      if (R > reach && outer > 0) break;
      outer = R;
      for (let k = 0; k < N; k++) {
        const a = 2 * Math.PI * k / N;
        pts[3 * k] = R * Math.cos(a); pts[3 * k + 1] = R * Math.sin(a); pts[3 * k + 2] = 0;
      }
      ctx.beginPath(); this._polyline(pts, N, true); ctx.stroke();
      // Label on the side of the ring facing the camera.
      const a = this.cam.yaw + 0.5;
      if (this._view([R * Math.cos(a), R * Math.sin(a), 0], vw) > 0 && R > this.cam.dist * 0.06) {
        this._toScreen(vw, s);
        this._label(this.gridLabel(au), s[0] + 4, s[1] - 3, "rgba(127,212,255,.5)");
      }
    }
    ctx.strokeStyle = "rgba(76,157,255,.08)";
    const inner = this.scaleRadius(RINGS_AU[0]);
    ctx.beginPath();
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * k / 6;
      this._polyline(new Float32Array([inner * Math.cos(a), inner * Math.sin(a), 0,
                                       outer * Math.cos(a), outer * Math.sin(a), 0]), 2, false);
    }
    ctx.stroke();
  }

  // Stars use the camera ROTATION only: no eye position, no distance, no
  // radial scale. That is what "at infinity" means.
  _stars() {
    const ctx = this.ctx, sky = this.sky, d = sky.dir, r = this.r, u = this.u, f = this.f;
    const cx = this.W / 2, cy = this.H / 2, F = this.F, W = this.W, H = this.H;
    let cls = -1;
    for (let i = 0; i < sky.n; i++) {
      const mag = sky.mag[i];
      if (mag > this.maxStarMag) continue;
      const x = d[3 * i], y = d[3 * i + 1], z = d[3 * i + 2];
      const zc = x * f[0] + y * f[1] + z * f[2];
      if (zc < 0.08) continue;
      const sx = cx + F * (x * r[0] + y * r[1]) / zc;
      const sy = cy - F * (x * u[0] + y * u[1] + z * u[2]) / zc;
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
      if (sky.cls[i] !== cls) { cls = sky.cls[i]; ctx.fillStyle = CLASS_COLORS[cls]; }
      const rad = starRadius(mag);
      ctx.globalAlpha = starAlpha(mag);
      if (rad > 1.1) { ctx.beginPath(); ctx.arc(sx, sy, rad, 0, 6.3); ctx.fill(); }
      else ctx.fillRect(sx - rad, sy - rad, 2 * rad, 2 * rad);
    }
    ctx.globalAlpha = 1;
    if (!this.show.starNames) return;
    ctx.font = "10px 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(147,161,181,.55)";
    for (const nm of sky.names) {
      if (nm.mag > 1.3) continue;
      const i = nm.i, x = d[3 * i], y = d[3 * i + 1], z = d[3 * i + 2];
      const zc = x * f[0] + y * f[1] + z * f[2];
      if (zc < 0.08) continue;
      const sx = cx + F * (x * r[0] + y * r[1]) / zc, sy = cy - F * (x * u[0] + y * u[1] + z * u[2]) / zc;
      if (sx < 0 || sx > W - 40 || sy < 12 || sy > H) continue;
      ctx.fillText(nm.name, sx + 6, sy - 5);
    }
  }

  // Screen position of a sky direction, or null when behind the camera.
  // Exposed for the tests: it must not depend on cam.dist or cam.target.
  projectDirection(v) {
    this._basis();
    const zc = v[0] * this.f[0] + v[1] * this.f[1] + v[2] * this.f[2];
    if (zc < 0.08) return null;
    return [this.W / 2 + this.F * (v[0] * this.r[0] + v[1] * this.r[1]) / zc,
            this.H / 2 - this.F * (v[0] * this.u[0] + v[1] * this.u[1] + v[2] * this.u[2]) / zc];
  }

  pick(x, y, radius = 18) {
    let best = -1, bd = radius * radius;
    for (const b of this.screen) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bd) { bd = d; best = b.i; }
    }
    return best;
  }
}
