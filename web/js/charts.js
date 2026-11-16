// Small canvas line chart: one axis pair, optional log y, crosshair tooltip.
// Series identity is never carried by colour alone: every chart with two or
// more series has an HTML legend, and the tooltip lists every series.

const MONO = "10.5px 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n) => (n < 0 ? "⁻" : "") + String(Math.abs(n)).split("").map((d) => SUP[+d]).join("");

export function formatValue(v, unit = "") {
  if (v === null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  let s;
  if (a === 0) s = "0";
  else if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    s = (v / 10 ** e).toFixed(2) + "·10" + sup(e);
  } else if (a >= 100) s = v.toFixed(0);
  else if (a >= 10) s = v.toFixed(1);
  else if (a >= 1) s = v.toFixed(2);
  else s = v.toPrecision(2);
  return unit ? `${s} ${unit}` : s;
}

export class LineChart {
  // opts: { logY, unit, xUnit, series: [{name, color, dash}], hlines: [{y, label}],
  //         yMin, yMax (optional fixed bounds), height }
  constructor(host, opts) {
    this.opts = opts;
    this.host = host;
    host.classList.add("chart");
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    if (opts.label) this.canvas.setAttribute("aria-label", opts.label);
    this.tip = document.createElement("div");
    this.tip.className = "chart-tip";
    this.tip.hidden = true;
    host.append(this.canvas, this.tip);
    if (opts.series.length > 1) {
      this.legend = document.createElement("div");
      this.legend.className = "chart-legend";
      host.append(this.legend);
      this.setSeries(opts.series);
    }
    this.x = []; this.ys = [];
    this.hover = -1;
    const move = (ev) => {
      const r = this.canvas.getBoundingClientRect();
      this._hover(ev.clientX - r.left, ev.clientY - r.top);
    };
    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerdown", move);
    this.canvas.addEventListener("pointerleave", () => { this.hover = -1; this.tip.hidden = true; this.draw(); });
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(host);
  }

  setSeries(series) {
    this.opts.series = series;
    if (!this.legend) return;
    this.legend.replaceChildren(...series.map((s) => {
      const item = document.createElement("span");
      const key = document.createElement("i");
      key.style.background = s.color;
      if (s.dash) key.classList.add("dashed");
      const name = document.createElement("span");
      name.textContent = s.name;
      item.append(key, name);
      return item;
    }));
  }

  // x: array of numbers; ys: one array per series (NaN = gap).
  setData(x, ys) { this.x = x; this.ys = ys; this.draw(); }

  _bounds() {
    const o = this.opts;
    let lo = Infinity, hi = -Infinity;
    for (const y of this.ys) for (const v of y) {
      if (!Number.isFinite(v) || (o.logY && v <= 0)) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    for (const h of o.hlines || []) { if (h.y < lo) lo = h.y; if (h.y > hi) hi = h.y; }
    if (!Number.isFinite(lo)) { lo = o.logY ? 1e-3 : 0; hi = o.logY ? 1 : 1; }
    if (o.logY) {
      lo = Math.max(lo, o.floor || 1e-16);
      let a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
      if (b <= a) b = a + 1;
      if (b - a < 2) a -= 1;
      return [a, b];
    }
    if (o.yMin !== undefined) lo = Math.min(lo, o.yMin);
    if (o.yMax !== undefined) hi = Math.max(hi, o.yMax);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    return [o.yMin !== undefined && lo >= o.yMin ? lo : lo - pad, hi + pad];
  }

  draw() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const W = this.host.clientWidth, H = this.opts.height || 150;
    if (!W) return;
    const c = this.canvas, ctx = c.getContext("2d");
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + "px"; c.style.height = H + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const o = this.opts, L = 46, R = 8, T = 8, B = 22;
    const pw = W - L - R, ph = H - T - B;
    const x = this.x, n = x.length;
    let x0 = n ? x[0] : 0, x1 = n ? x[n - 1] : 1;
    if (x1 - x0 < (o.minSpan || 1)) x1 = x0 + (o.minSpan || 1);
    const [y0, y1] = this._bounds();
    const X = (v) => L + (v - x0) / (x1 - x0) * pw;
    const Y = (v) => {
      const t = o.logY ? (Math.log10(Math.max(v, 1e-300)) - y0) / (y1 - y0) : (v - y0) / (y1 - y0);
      return T + ph - Math.max(-0.02, Math.min(1.02, t)) * ph;
    };
    this._geom = { X, L, pw, x0, x1 };

    ctx.font = MONO; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(147,161,181,.13)"; ctx.fillStyle = "#6f7d92";
    ctx.textAlign = "right";
    if (o.logY) {
      const stepDec = Math.max(1, Math.ceil((y1 - y0) / 6));
      for (let d = y0; d <= y1; d += stepDec) {
        const py = T + ph - (d - y0) / (y1 - y0) * ph;
        ctx.beginPath(); ctx.moveTo(L, py + 0.5); ctx.lineTo(L + pw, py + 0.5); ctx.stroke();
        ctx.fillText(d === 0 ? "1" : d === 1 ? "10" : "10" + sup(d), L - 6, py);
      }
    } else {
      const span = y1 - y0, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
      const stepV = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw);
      for (let v = Math.ceil(y0 / stepV) * stepV; v <= y1 + 1e-12; v += stepV) {
        const py = Y(v);
        ctx.beginPath(); ctx.moveTo(L, py + 0.5); ctx.lineTo(L + pw, py + 0.5); ctx.stroke();
        ctx.fillText(Math.abs(v) < 1e-12 ? "0" : +v.toPrecision(4) + "", L - 6, py);
      }
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xs = x1 - x0, xr = xs / 5, xm = 10 ** Math.floor(Math.log10(xr));
    const xStep = [1, 2, 5, 10].map((k) => k * xm).find((s) => s >= xr);
    for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 + 1e-9; v += xStep)
      ctx.fillText(+v.toPrecision(6) + "", X(v), T + ph + 6);
    ctx.textAlign = "right";
    if (o.xUnit) ctx.fillText(o.xUnit, L + pw, T + ph + 6 - 16);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    if (o.unit) ctx.fillText(o.unit, L + 4, T + 1);

    for (const h of o.hlines || []) {
      ctx.strokeStyle = "rgba(147,161,181,.55)"; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(L, Y(h.y)); ctx.lineTo(L + pw, Y(h.y)); ctx.stroke(); ctx.setLineDash([]);
      if (h.label) { ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(h.label, L + pw - 2, Y(h.y) - 2); }
    }

    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw, ph + 4); ctx.clip();
    ctx.lineWidth = 2; ctx.lineJoin = "round";
    this.ys.forEach((y, si) => {
      const s = o.series[si];
      if (!s) return;
      ctx.strokeStyle = s.color; ctx.setLineDash(s.dash ? [5, 4] : []);
      ctx.beginPath();
      let pen = false;
      const stride = Math.max(1, Math.floor(n / (pw * 2)));
      for (let i = 0; i < n; i += stride) {
        const v = y[i];
        if (!Number.isFinite(v) || (o.logY && v <= 0)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(x[i]), Y(v)); else { ctx.moveTo(X(x[i]), Y(v)); pen = true; }
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
    if (this.hover >= 0 && this.hover < n) {
      const hx = X(x[this.hover]);
      ctx.strokeStyle = "rgba(232,238,247,.45)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx + 0.5, T); ctx.lineTo(hx + 0.5, T + ph); ctx.stroke();
      this.ys.forEach((y, si) => {
        const v = y[this.hover];
        if (!Number.isFinite(v) || !o.series[si] || (o.logY && v <= 0)) return;
        ctx.fillStyle = o.series[si].color; ctx.strokeStyle = "#0b101a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, Y(v), 4, 0, 6.3); ctx.fill(); ctx.stroke();
      });
    }
    ctx.restore();
  }

  _hover(px) {
    const g = this._geom, n = this.x.length;
    if (!g || !n) return;
    const xv = g.x0 + (px - g.L) / g.pw * (g.x1 - g.x0);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.x[mid] < xv) lo = mid; else hi = mid; }
    this.hover = Math.abs(this.x[lo] - xv) < Math.abs(this.x[hi] - xv) ? lo : hi;
    const o = this.opts, rows = [];
    const head = document.createElement("div");
    head.className = "chart-tip-head";
    head.textContent = `${(+this.x[this.hover].toFixed(2))} ${o.xUnit || ""}`;
    rows.push(head);
    this.ys.forEach((y, si) => {
      const s = o.series[si], v = y[this.hover];
      if (!s || !Number.isFinite(v)) return;
      const row = document.createElement("div"), key = document.createElement("i");
      key.style.background = s.color;
      const val = document.createElement("b"); val.textContent = formatValue(v, o.unit);
      const name = document.createElement("span"); name.textContent = s.name;
      row.append(key, val, name);
      rows.push(row);
    });
    this.tip.replaceChildren(...rows);
    this.tip.hidden = false;
    const hx = g.X(this.x[this.hover]), W = this.host.clientWidth;
    this.tip.style.left = (hx > W / 2 ? Math.max(0, hx - this.tip.offsetWidth - 10) : hx + 10) + "px";
    this.draw();
  }

  destroy() { this.ro.disconnect(); this.host.replaceChildren(); }
}
