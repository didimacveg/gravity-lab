// Guided experiments. Each one builds a scene (a Simulation plus view
// settings), a panel with a short explanation and a chart, and a list of
// numerical checks that are evaluated live. The same checks run in CI:
// tests/test_experiments.cpp (C++) and web/tests/ (this code, under Node).
import { t, num, bodyName } from "./i18n.js";
import { LineChart, formatValue } from "./charts.js";
import { PLANET_COLORS } from "./render.js";
import { elements, leadAngle, AU_KM, ARCSEC_PER_RADIAN } from "./physics.js";
import {
  Simulation, solarSystem, lagrangeIdeal, voyager, einsteinPrecession, measureOrders,
  relSpeed, distanceKm, vInfinity, ACCEPTED_GR_PRECESSION,
} from "./sim.js";

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"];
const fix = (v, d) => (Number.isFinite(v) ? num(v.toFixed(d)) : "–");

// A list of checks: [{label, value, expected, state: 'pass'|'fail'|'wait'}]
export function renderChecks(list, checks) {
  list.replaceChildren(...checks.map((c) => h("li", {},
    h("span", { text: c.label }),
    h("span", { class: "val" }, c.value, h("span", { class: `badge ${c.state}`, text: t("exp." + c.state) })),
    c.expected ? h("span", { class: "exp", text: c.expected }) : null)));
}

function panelShell(host, id, extraControls = []) {
  const chartHost = h("div");
  const checks = h("ul", { class: "checks-list" });
  host.replaceChildren(...[
    h("p", { class: "exp-text", text: t(`exp.${id}.text`) }),
    extraControls.length ? h("div", { class: "exp-controls" }, extraControls) : null,
    h("div", { class: "group" }, h("h3", { text: t(`exp.${id}.chart`) }), chartHost),
    h("div", { class: "group" }, h("h3", { text: t("exp.check") }), checks)].filter(Boolean));
  return { chartHost, checks };
}

const segmented = (options, current, onPick) => h("div", { class: "seg", role: "group" },
  options.map(([value, label]) => h("button", {
    type: "button", "aria-pressed": String(value === current), text: label,
    onclick: () => onPick(value),
  })));

// ---------------------------------------------------------------- Mercury
function mercury(ctx) {
  const sys = solarSystem(ctx.meta);
  const sim = new Simulation({ ...sys, method: "yoshida6", dt: 0.25, reference: ctx.reference, twin: true });
  const el0 = elements(sim.world, 1, 0);
  const formula = einsteinPrecession(el0.a, el0.e, sim.world.mass[0]);
  let chart, checks;
  const scene = {
    id: "mercury", sim, extras: [], speed: 365, speeds: [30, 100, 365, 3650, Infinity],
    trailEvery: 2, perihelionOf: 1, trailOnly: null, endDays: 36512,
    view: { dist: 1.7, pitch: 1.15, yaw: -1.3, scale: "linear", origin: 0, rotateWith: -1, focus: -1 },
    show: { orbits: true, trails: false },
    buildPanel(host) {
      const s = panelShell(host, "mercury");
      checks = s.checks;
      chart = new LineChart(s.chartHost, {
        unit: "″", xUnit: t("val.years"), label: t("exp.mercury.chart"), height: 170, yMin: 0, minSpan: 2,
        series: [{ name: t("val.measured"), color: "#4c9dff" },
                 { name: t("val.grLine"), color: "#93a1b5", dash: true }],
      });
      scene.updatePanel();
    },
    updatePanel() {
      if (!chart) return;
      const ref = sim.ref, x = [], y = [], line = [];
      for (let s = sim.lo; s <= sim.hi; s++) {
        const yr = (s - ref.epochIndex) * ref.cadence / 365.25;
        x.push(yr); y.push(sim.grVarpi[s] * ARCSEC_PER_RADIAN); line.push(ACCEPTED_GR_PRECESSION * yr / 100);
      }
      chart.setData(x, [y, line]);
      const r = sim.mercuryRates(), ready = r && r.spanYears >= 10;   // periodic terms average out
      renderChecks(checks, [
        { label: t("val.gr"), value: ready ? `${fix(r.gr, 2)} ${t("unit.arcsecCy")}` : t("val.measuring"),
          expected: `${t("val.accepted")} ${num("42.98")} ± 0.1 · ${t("exp.mercury.formula")}: ${fix(formula, 2)}`,
          state: !ready ? "wait" : Math.abs(r.gr - ACCEPTED_GR_PRECESSION) < 0.1 ? "pass" : "fail" },
        { label: t("val.total"), value: ready ? `${fix(r.sim, 1)} ${t("unit.arcsecCy")}` : t("val.measuring"),
          expected: `${t("val.de441")}: ${ready ? fix(r.de441, 1) : "–"} ± 0.5`,
          state: !ready ? "wait" : Math.abs(r.sim - r.de441) < 0.5 ? "pass" : "fail" },
      ]);
    },
  };
  return scene;
}

// --------------------------------------------------------------- Lagrange
function lagrange(ctx, variant = "real") {
  const ideal = variant === "ideal";
  const sys = ideal ? lagrangeIdeal(ctx.meta) : solarSystem(ctx.meta, { trojans: true });
  const sim = new Simulation({
    ...sys, method: ideal ? "yoshida4" : "yoshida6", dt: ideal ? 2 : 0.5,
    forces: ideal ? { pn: false, emq: false } : {},
  });
  const J = ideal ? 1 : 5, ids = sys.trojans, w = sim.world;
  const years = [], angles = ids.map(() => []);
  const lo = ids.map(() => Infinity), hi = ids.map(() => -Infinity), sum = ids.map(() => 0);
  let count = 0, nextSample = 0, worstKm = 0, nextRef = 1;
  // Libration period (ideal case): mean of the lead angle over one Jupiter
  // period filters the fast epicycle; the period is the spacing of the
  // upward crossings of 60 degrees.
  const lib = { acc: 0, n: 0, prev: null, crossings: [], t0: 0 };
  const sampleEvery = ideal ? 30 : 40;
  let chart, checks, rotating = true;

  const scene = {
    id: "lagrange", variant, sim, extras: [], speed: 3650, speeds: [365, 3650, 18262.5, Infinity],
    trailEvery: 90, perihelionOf: -1, trailOnly: new Set(["trojan"]), endDays: ideal ? 365250 : 36512 * 2,
    view: { dist: 19, pitch: 1.5, yaw: -Math.PI / 2, scale: "linear", origin: 0, rotateWith: J, focus: -1 },
    show: { orbits: false, trails: true },
    colors: new Map(ids.map((id, k) => [id, SERIES[k % SERIES.length]])),
    markers(renderer) {
      const v = renderer.frame(w, J, [0, 0, 0]), out = [];
      for (const [name, sign] of [["L4", 1], ["L5", -1]]) {
        const a = sign * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
        out.push({ pos: [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]], label: name, color: "#7fd4ff" });
      }
      return out;
    },
    afterAdvance() {
      while (w.time >= nextSample) {
        nextSample += sampleEvery;
        years.push(w.time / 365.25);
        ids.forEach((id, k) => {
          const a = leadAngle(w, id, J, 0);
          angles[k].push(a);
          if (a < lo[k]) lo[k] = a;
          if (a > hi[k]) hi[k] = a;
          sum[k] += a;
        });
        count++;
        if (ideal) {
          lib.acc += angles[0][angles[0].length - 1]; lib.n++;
          if (lib.n * sampleEvery >= sys.jupiterPeriod) {
            const mean = lib.acc / lib.n, tMid = w.time - lib.n * sampleEvery / 2;
            if (lib.prev && lib.prev.mean < 60 && mean >= 60) {
              const f = (60 - lib.prev.mean) / (mean - lib.prev.mean);
              lib.crossings.push(lib.prev.t + f * (tMid - lib.prev.t));
            }
            lib.prev = { mean, t: tMid }; lib.acc = 0; lib.n = 0;
          }
        }
      }
      if (!ideal) {
        const step = ctx.meta.trojan_step_days;
        while (nextRef < ctx.meta.trojans[0].ref.length && w.time >= nextRef * step - 1e-6) {
          if (Math.abs(w.time - nextRef * step) < 1e-6)
            ids.forEach((id, k) => {
              const r = ctx.meta.trojans[k].ref[nextRef], p = w.pos, o = 3 * id;
              worstKm = Math.max(worstKm, Math.hypot(p[o] - r[0], p[o + 1] - r[1], p[o + 2] - r[2]) * AU_KM);
            });
          nextRef++;
        }
      }
    },
    buildPanel(host) {
      const s = panelShell(host, "lagrange", [
        segmented([["real", t("exp.lagrange.real")], ["ideal", t("exp.lagrange.ideal")]], variant,
                  (v) => ctx.loadExperiment("lagrange", v)),
        h("label", { class: "check" },
          h("input", { type: "checkbox", checked: rotating, onchange: (e) => {
            rotating = e.target.checked; ctx.setRotating(rotating ? J : -1);
          } }), h("span", { text: t("exp.lagrange.rotating") })),
      ]);
      checks = s.checks;
      chart = new LineChart(s.chartHost, {
        unit: "°", xUnit: t("val.years"), label: t("exp.lagrange.chart"), height: 190, minSpan: 20,
        hlines: [{ y: 60, label: "L4" }, { y: -60, label: "L5" }],
        series: ids.map((id, k) => ({ name: w.name[id], color: SERIES[k % SERIES.length] })),
      });
      scene.updatePanel();
    },
    updatePanel() {
      if (!chart) return;
      chart.setData(years, angles);
      const yrs = w.time / 365.25, ready = yrs >= 15;
      const half = ids.length / 2;
      const inBand = ids.every((_, k) => {
        const sign = k < half ? 1 : -1;
        return sign * lo[k] > 30 && sign * hi[k] > 30 && sign * lo[k] < 95 && sign * hi[k] < 95;
      });
      const mean = (from, to) => { let s = 0; for (let k = from; k < to; k++) s += sum[k] / count; return s / (to - from); };
      const m4 = count ? mean(0, half) : NaN, m5 = count ? mean(half, ids.length) : NaN;
      const list = [
        { label: t("exp.lagrange.bounded"),
          value: count ? `${fix(Math.min(...lo.slice(0, half)), 0)}°…${fix(Math.max(...hi.slice(0, half)), 0)}° / ${fix(Math.min(...lo.slice(half)), 0)}°…${fix(Math.max(...hi.slice(half)), 0)}°` : "–",
          expected: "L4: +30°…+95° · L5: −95°…−30°",
          state: !ready ? "wait" : inBand ? "pass" : "fail" },
        { label: t("exp.lagrange.mean"), value: `${fix(m4, 1)}° / ${fix(m5, 1)}°`,
          expected: "+60° / −60° ± 5°",
          state: yrs < 150 ? "wait" : Math.abs(m4 - 60) < 5 && Math.abs(m5 + 60) < 5 ? "pass" : "fail" },
      ];
      if (ideal) {
        const c = lib.crossings, have = c.length >= 2;
        const period = have ? (c[c.length - 1] - c[0]) / (c.length - 1) / 365.25 : NaN;
        const theory = sys.libTheoryDays / 365.25;
        list.push({ label: t("exp.lagrange.period"), value: have ? `${fix(period, 1)} ${t("time.year")}` : t("val.measuring"),
                    expected: `${t("exp.lagrange.theory")}: ${fix(theory, 1)} ${t("time.year")} ± 2%`,
                    state: !have ? "wait" : Math.abs(period / theory - 1) < 0.02 ? "pass" : "fail" });
      } else {
        list.push({ label: t("exp.lagrange.horizons"), value: nextRef > 1 ? formatValue(worstKm, "km") : t("val.measuring"),
                    expected: `< 600 km · ${fix(Math.min(yrs, (nextRef - 1) * ctx.meta.trojan_step_days / 365.25), 0)} ${t("time.year")}`,
                    state: nextRef <= 1 ? "wait" : worstKm < 600 ? "pass" : "fail" });
      }
      renderChecks(checks, list);
    },
  };
  return scene;
}

// ---------------------------------------------------------------- Voyager
function voyagerScene(ctx, frame = "jupiter") {
  const sys = voyager(ctx.meta), ref = sys.ref;
  const sim = new Simulation({ ...sys, method: "yoshida6", dt: 1 / 96, forces: { emq: false } });
  const w = sim.world, P = sys.probe, J = sys.jupiter;
  const days = [], vSim = [], vRef = [];
  const refSpeed = (k) => {
    const a = ref.probe[k], s = ref.sun[k];
    return Math.hypot(a[3] - s[3], a[4] - s[4], a[5] - s[5]) * AU_KM / 86400;
  };
  const vIn = relSpeed(w, P, 0), vInfIn = vInfinity(w, P, J);
  let closest = distanceKm(w, P, J), errNow = 0, nextK = 0;
  let chart, checks;
  const record = () => {
    while (nextK < ref.samples && w.time >= nextK * ref.step_days - 1e-9) {
      days.push(nextK * ref.step_days); vSim.push(relSpeed(w, P, 0)); vRef.push(refSpeed(nextK));
      const r = ref.probe[nextK], p = w.pos, o = 3 * P;
      errNow = Math.hypot(p[o] - r[0], p[o + 1] - r[1], p[o + 2] - r[2]) * AU_KM;
      nextK++;
    }
  };
  record();
  const jupiterView = frame === "jupiter";
  const scene = {
    id: "voyager", variant: frame, sim, extras: [], speed: 2, speeds: [0.5, 1, 2, 5, 20],
    trailEvery: 0.1, perihelionOf: -1, trailOnly: new Set(["probe"]), endDays: (ref.samples - 1) * ref.step_days,
    chunk: 1, selected: P,
    view: jupiterView
      ? { dist: 0.34, pitch: 1.2, yaw: 0.6, scale: "linear", origin: J, rotateWith: -1, focus: -1 }
      : { dist: 2.4, pitch: 1.1, yaw: -1.9, scale: "linear", origin: 0, rotateWith: -1, focus: J },
    show: { orbits: !jupiterView, trails: true },
    afterAdvance() {
      const d = distanceKm(w, P, J);
      if (d < closest) closest = d;
      record();
    },
    buildPanel(host) {
      const s = panelShell(host, "voyager", [
        segmented([["jupiter", t("exp.voyager.frameJ")], ["sun", t("exp.voyager.frameS")]], frame,
                  (v) => ctx.loadExperiment("voyager", v)),
      ]);
      checks = s.checks;
      chart = new LineChart(s.chartHost, {
        unit: "km/s", xUnit: t("exp.voyager.days"), label: t("exp.voyager.chart"), height: 170, minSpan: 10, yMin: 8,
        series: [{ name: t("exp.voyager.sim"), color: "#4c9dff" },
                 { name: t("exp.voyager.jpl"), color: "#93a1b5", dash: true }],
      });
      host.append(h("p", { class: "hint", text: t("exp.voyager.errNote") }));
      scene.updatePanel();
    },
    updatePanel() {
      if (!chart) return;
      chart.setData(days, [vSim, vRef]);
      const done = w.time >= scene.endDays - 1e-6, past = w.time > 34;
      const vOut = relSpeed(w, P, 0), vOutRef = refSpeed(ref.samples - 1), vInfOut = vInfinity(w, P, J);
      renderChecks(checks, [
        { label: t("exp.voyager.gain"), value: `${fix(vIn, 2)} → ${fix(vOut, 2)} km/s`,
          expected: `> +9.5 km/s`, state: !done ? "wait" : vOut - vIn > 9.5 ? "pass" : "fail" },
        { label: t("exp.voyager.out"), value: `${fix(vOut, 3)} km/s`,
          expected: `JPL: ${fix(vOutRef, 3)} ± 0.05 km/s`,
          state: !done ? "wait" : Math.abs(vOut - vOutRef) < 0.05 ? "pass" : "fail" },
        { label: t("exp.voyager.vinf"), value: `${fix(vInfIn, 3)} → ${fix(vInfOut, 3)} km/s`,
          expected: "± 0.1%", state: !done ? "wait" : Math.abs(vInfOut / vInfIn - 1) < 1e-3 ? "pass" : "fail" },
        { label: t("exp.voyager.closest"), value: formatValue(closest, "km"),
          expected: `${t("exp.voyager.real")}: 721 670 km ± 2000`,
          state: !past ? "wait" : Math.abs(closest - 721670) < 2000 ? "pass" : "fail" },
        { label: t("exp.voyager.err"), value: formatValue(errNow, "km"),
          expected: "< 1000 km (t < 30 d) · < 250 000 km (t = 60 d)",
          state: w.time < 1 ? "wait" : errNow < (w.time <= 30 ? 1000 : 250000) ? "pass" : "fail" },
      ]);
    },
  };
  return scene;
}

// ------------------------------------------------------------ Integrators
const METHODS = [["euler", "Euler"], ["rk4", "RK4"], ["verlet", "Verlet"], ["yoshida4", "Yoshida 4"], ["yoshida6", "Yoshida 6"]];
let ordersCache = null;

function integrators(ctx, variant = "0.5:euler") {
  const [dtText, shown] = variant.split(":"), dt = +dtText;
  const sims = METHODS.map(([m]) => new Simulation({
    ...solarSystem(ctx.meta), method: m, dt, forces: { pn: false, emq: false } }));
  const main = sims[METHODS.findIndex(([m]) => m === shown)];
  const years = [], drift = METHODS.map(() => []);
  let nextSample = 0, chart, checks;
  ordersCache = ordersCache || measureOrders();
  const expected = { euler: 1, rk4: 4, verlet: 2, yoshida4: 4, yoshida6: 6 };
  const scene = {
    id: "integrators", variant, sim: main, extras: sims.filter((s) => s !== main),
    speed: 365, speeds: [30, 100, 365, 1826.25], trailEvery: 3, perihelionOf: -1, trailOnly: null,
    endDays: 36525,
    view: { dist: 6, pitch: 1.1, yaw: -1.2, scale: "linear", origin: 0, rotateWith: -1, focus: -1 },
    show: { orbits: false, trails: true },
    afterAdvance() {
      while (main.world.time >= nextSample) {
        nextSample += 8;
        years.push(main.world.time / 365.25);
        // Largest error so far: the instantaneous value oscillates with
        // every orbit and the five curves would hide each other.
        sims.forEach((s, k) => { s._energy(); drift[k].push(s.maxDrift); });
      }
    },
    buildPanel(host) {
      const s = panelShell(host, "integrators", [
        h("label", { class: "field" }, h("span", { text: t("exp.integrators.show") }),
          h("select", { onchange: (e) => ctx.loadExperiment("integrators", `${dt}:${e.target.value}`) },
            METHODS.map(([m, name]) => h("option", { value: m, selected: m === shown, text: name })))),
        h("label", { class: "field" }, h("span", { text: `${t("sim.dt")} (${t("sim.days")})` }),
          h("select", { onchange: (e) => ctx.loadExperiment("integrators", `${e.target.value}:${shown}`) },
            [0.25, 0.5, 1, 2].map((v) => h("option", { value: v, selected: v === dt, text: num(v) })))),
      ]);
      checks = s.checks;
      chart = new LineChart(s.chartHost, {
        logY: true, floor: 1e-15, xUnit: t("val.years"), label: t("exp.integrators.chart"), height: 200, minSpan: 2,
        series: METHODS.map(([, name], k) => ({ name, color: SERIES[k] })),
      });
      const table = h("table", { class: "values" },
        h("thead", {}, h("tr", {}, h("th"), h("th", { text: t("val.measured") }), h("th", { text: t("exp.integrators.expected") }))),
        h("tbody", {}, METHODS.map(([m, name]) => h("tr", {},
          h("td", { text: name }), h("td", { text: fix(ordersCache[m], 2) }), h("td", { text: String(expected[m]) })))));
      host.append(h("div", { class: "group" }, h("h3", { text: t("exp.integrators.orders") }), table));
      scene.updatePanel();
    },
    updatePanel() {
      if (!chart) return;
      chart.setData(years, drift);
      const yrs = main.world.time / 365.25, ready = yrs >= 10;
      const eu = sims[0].maxDrift, y4 = sims[3].maxDrift;
      const y4Limit = dt <= 0.5 ? 1e-8 : dt <= 1 ? 1e-6 : 1e-4;
      renderChecks(checks, [
        { label: t("exp.integrators.euler"), value: formatValue(eu), expected: "> 10⁻³",
          state: !ready ? "wait" : eu > 1e-3 ? "pass" : "fail" },
        { label: t("exp.integrators.yoshida"), value: formatValue(y4), expected: `< ${formatValue(y4Limit)} (dt = ${num(dt)} d)`,
          state: !ready ? "wait" : y4 < y4Limit ? "pass" : "fail" },
        { label: t("exp.integrators.ratio"), value: y4 > 0 ? formatValue(eu / y4) : "–", expected: "> 10⁴",
          state: !ready ? "wait" : eu / y4 > 1e4 ? "pass" : "fail" },
      ]);
    },
  };
  return scene;
}

export const EXPERIMENTS = [
  { id: "mercury", build: mercury },
  { id: "lagrange", build: lagrange },
  { id: "voyager", build: voyagerScene },
  { id: "integrators", build: integrators },
];

export { PLANET_COLORS, bodyName };
