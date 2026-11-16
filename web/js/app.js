// gravity-lab browser app: wiring between the physics, the 3D view, the
// validation panel and the guided experiments.
import { t, num, bodyName, setLang, getLang, initialLang, onLangChange } from "./i18n.js";
import { Renderer, PLANET_COLORS } from "./render.js";
import { buildSky } from "./sky.js";
import { LineChart, formatValue } from "./charts.js";
import { elements, schwarzschildRadius, computeAccelerations, INTEGRATORS, AU_KM, KMS_PER_AUD, ARCSEC_PER_RADIAN, G } from "./physics.js";
import { Simulation, Reference, solarSystem, jdToDate, dateToJd, PLANET_NAMES, DT_CHOICES, ACCEPTED_GR_PRECESSION } from "./sim.js";
import { EXPERIMENTS, h } from "./experiments.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = () => matchMedia("(max-width: 900px)").matches;

const state = {
  meta: null, reference: null, table: null,
  tab: "sim",
  scene: null,            // active scene
  real: null,             // the real Solar System scene, kept alive across tabs
  exp: null, expId: "mercury",
  what: null,
  playing: !reducedMotion,
  seek: null,             // { target: days, label }
  acc: 0, lastTrail: 0, lastPanel: 0, last: 0,
  cfg: { method: "yoshida6", dt: 0.25, pn: true, emq: true, j2: false, minor: false },
  show: { orbits: true, trails: false, labels: true, grid: true, stars: true, starNames: true },
};
let renderer, charts = {};

// ------------------------------------------------------------------ data
async function load() {
  const get = async (url, kind) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r[kind]();
  };
  const [meta, buf, stars, table] = await Promise.all([
    get("data/horizons.json", "json"), get("data/horizons_planets.f64", "arrayBuffer"),
    get("data/stars.json", "json"), get("data/validation.json", "json"),
  ]);
  state.meta = meta;
  state.reference = new Reference(new Float64Array(buf), meta);
  state.table = table;
  renderer.sky = buildSky(stars);
}

// ---------------------------------------------------------------- scenes
function buildReal() {
  const c = state.cfg;
  const sys = solarSystem(state.meta, { minor: c.minor });
  const sim = new Simulation({ ...sys, method: c.method, dt: c.dt, reference: state.reference, twin: true,
                               forces: { pn: c.pn, emq: c.emq, j2: c.j2 } });
  return {
    id: "real", sim, extras: [], speed: state.real ? state.real.speed : 30,
    speeds: [1, 10, 30, 100, 365.25, 3652.5, Infinity], trailEvery: 2, perihelionOf: -1, trailOnly: null,
    endDays: null,
    view: state.real ? state.real.view : { dist: smallScreen() ? 24 : 17, pitch: 0.62, yaw: -1.05, scale: "linear", origin: 0, rotateWith: -1, focus: -1 },
  };
}

function buildWhatIf() {
  const sys = solarSystem(state.meta, { minor: true });
  const sim = new Simulation({ ...sys, method: "yoshida4", dt: 0.5, adaptive: true,
                               forces: { pn: false, emq: false } });
  return {
    id: "what", sim, extras: [], speed: 365.25, speeds: [30, 100, 365.25, 1826.25, 3652.5],
    trailEvery: 4, perihelionOf: -1, trailOnly: null, endDays: null, ejected: new Set(),
    view: { dist: 130, pitch: 0.75, yaw: -1.05, scale: "linear", origin: 0, rotateWith: -1, focus: -1 },
    show: { orbits: true, trails: true },
  };
}

function activate(scene, keepView = false) {
  state.scene = scene;
  state.acc = 0; state.seek = null;
  renderer.reset(scene.sim.world);
  state.lastTrail = scene.sim.world.time;
  if (scene.view && !keepView) {
    const v = scene.view;
    Object.assign(renderer.cam, { dist: v.dist, pitch: v.pitch, yaw: v.yaw, target: [0, 0, 0] });
    renderer.origin = v.origin; renderer.rotateWith = v.rotateWith; renderer.focus = v.focus;
    setScale(v.scale);
  } else if (!keepView) {
    renderer.origin = 0; renderer.rotateWith = -1; renderer.focus = -1;
  }
  renderer.selected = scene.selected ?? -1;
  renderer.trailOnly = scene.trailOnly || null;
  renderer.colorOf = scene.colors || new Map();
  renderer.holeScale = 0;
  const show = { ...state.show, ...(scene.show || {}) };
  Object.assign(renderer.show, show);
  buildSpeedOptions();
  updateChrome();
  updateInfo();
}

function restartReal() {
  const keep = state.real ? state.real.speed : null;
  state.real = buildReal();
  if (keep) state.real.speed = keep;
  if (state.tab === "sim" || state.tab === "val") activate(state.real, true);
  refreshValidation(true);
}

const expCtx = {
  get meta() { return state.meta; },
  get reference() { return state.reference; },
  loadExperiment,
  setRotating(body) { renderer.rotateWith = body; renderer.clearTrails(); updateChrome(); },
};

function loadExperiment(id, variant) {
  const def = EXPERIMENTS.find((e) => e.id === id) || EXPERIMENTS[0];
  const sameKind = state.exp && state.exp.id === def.id;
  state.expId = def.id;
  state.exp = def.build(expCtx, variant);
  for (const b of $("exp-list").children) b.setAttribute("aria-pressed", String(b.dataset.exp === def.id));
  // Changing only the displayed integrator or the step keeps the camera.
  activate(state.exp, sameKind && def.id === "integrators");
  state.exp.buildPanel($("exp-body"));
  if (!reducedMotion) setPlaying(true);
}

// ------------------------------------------------------------------- tabs
function setTab(tab) {
  // Remember the camera of the real scene before leaving it.
  if (state.scene && state.scene === state.real && tab !== "sim" && tab !== "val")
    state.real.view = { dist: renderer.cam.dist, pitch: renderer.cam.pitch, yaw: renderer.cam.yaw,
                        scale: renderer.scale, origin: 0, rotateWith: -1, focus: -1 };
  state.tab = tab;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll(".tabpanel")) p.hidden = p.id !== "tab-" + tab;
  if (tab === "sim" || tab === "val") {
    if (state.scene !== state.real) activate(state.real);
    if (tab === "val") refreshValidation(true);
  } else if (tab === "exp") {
    if (!state.exp) loadExperiment(state.expId);
    else if (state.scene !== state.exp) { activate(state.exp); state.exp.buildPanel($("exp-body")); }
  } else if (tab === "what") {
    if (!state.what) state.what = buildWhatIf();
    if (state.scene !== state.what) activate(state.what);
    renderer.holeScale = holeScale();
    updateWhatIf();
  }
  updateChrome();
}

function updateChrome() {
  const s = state.scene;
  if (!s) return;
  const chip = $("chip");
  chip.classList.toggle("whatif", s.id === "what");
  chip.textContent = s.id === "real" ? t("chip.real")
    : s.id === "what" ? t("chip.what")
    : `${t("chip.exp")} · ${t(`exp.${s.id}.title`)}`;
  const notes = [t(renderer.scale === "log" ? "note.log" : "note.linear")];
  if (renderer.rotateWith >= 0) notes.push(t("note.rotating"));
  if (renderer.show.stars) notes.push(t("note.stars"));
  $("hud-note").textContent = notes.join("\n");
  const real = s.id === "real";
  $("goto").disabled = !real; $("go").disabled = !real;
  $("goto").title = t("time.range");
}

// ------------------------------------------------------------- time bar
function speedLabel(v) {
  if (!Number.isFinite(v)) return t("time.max");
  if (v >= 365) return `${num(+(v / 365.25).toFixed(1))} ${t("time.yearShort")}${t("time.perSec")}`;
  return `${num(v)} ${t("time.day")}${t("time.perSec")}`;
}
function buildSpeedOptions() {
  const sel = $("speed"), s = state.scene;
  sel.replaceChildren(...s.speeds.map((v) => h("option", { value: String(v), selected: v === s.speed, text: speedLabel(v) })));
}
function setPlaying(on) {
  state.playing = on;
  $("play-icon").setAttribute("d", on ? "M4 2h3v12H4zM9 2h3v12H9z" : "M4 2l10 6-10 6z");
  const key = on ? "time.pause" : "time.play";
  $("play").dataset.i18nTitle = key; $("play").title = t(key); $("play").setAttribute("aria-label", t(key));
}
function setScale(scale) {
  renderer.scale = scale;
  // Keep roughly the same framing when switching scales.
  for (const b of $("scale").children) b.setAttribute("aria-pressed", String(b.dataset.scale === scale));
  renderer.orbitAge = 1e9;
  updateChrome();
}

function seekTo(days, label) {
  const s = state.scene;
  if (s.id !== "real") return;
  state.seek = { target: days, label };
  setPlaying(true);
}

// -------------------------------------------------------------- stepping
function advance(dtFrame) {
  const s = state.scene, sim = s.sim, w = sim.world;
  let steps, dir = 1, until = s.endDays, budget = Number.isFinite(s.speed) ? 7 : 5;
  if (state.seek) {
    dir = state.seek.target >= w.time ? 1 : -1;
    until = state.seek.target; steps = Infinity; budget = 12;
  } else {
    if (!state.playing) return;
    if (s.endDays !== null && w.time >= s.endDays - sim.dt * 0.5) { setPlaying(false); return; }
    state.acc += Number.isFinite(s.speed) ? s.speed * dtFrame / sim.dt : Infinity;
    steps = Math.floor(state.acc);
    if (Number.isFinite(steps)) state.acc -= steps; else state.acc = 0;
  }
  if (steps < 1) return;
  const chunk = s.chunk || Math.max(1, Math.round(Math.min(s.trailEvery, 8) / sim.dt));
  const t0 = performance.now();
  sim.substeps = 0;
  let done = 0;
  while (done < steps) {
    const n = sim.advance(Math.min(chunk, steps - done), dir, until);
    for (const e of s.extras) e.advance(n, dir);
    done += n;
    if (s.afterAdvance) s.afterAdvance();
    if (Math.abs(w.time - state.lastTrail) >= s.trailEvery) { renderer.pushTrails(w); state.lastTrail = w.time; }
    if (n === 0) break;
    if (performance.now() - t0 > budget) { state.acc = 0; break; }
  }
  if (state.seek && Math.abs(state.seek.target - w.time) < sim.dt * 0.51) {
    state.seek = null; setPlaying(false); renderer.clearTrails(); state.lastPanel = 0;
  }
  if (s.id === "what") trackEjections(s);
}

// --------------------------------------------------------------- readout
const pad = (n) => String(n).padStart(2, "0");
function updateHud() {
  const sim = state.scene.sim, d = jdToDate(sim.jd);
  $("hud-date").textContent = `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}`;
  $("hud-jd").textContent = `JD ${num(sim.jd.toFixed(1))}`;
  const yrs = sim.years;
  $("hud-elapsed").textContent = Math.abs(yrs) < 0.5
    ? `${yrs >= 0 ? "+" : "−"}${num(Math.abs(sim.world.time).toFixed(1))} ${t("time.day")}`
    : `${yrs >= 0 ? "+" : "−"}${num(Math.abs(yrs).toFixed(2))} ${t("time.year")}`;
  const st = $("status");
  if (state.seek) { st.hidden = false; st.textContent = `${t("time.seeking")} ${state.seek.label}…`; }
  else if (!st.dataset.sticky) st.hidden = true;
}

function updateInfo() {
  const host = $("info"), s = state.scene, i = renderer.selected;
  if (!s || s.id !== "real" || i < 0 || !s.sim.world.alive[i]) {
    host.replaceChildren(h("p", { class: "muted", text: t("info.none") }));
    return;
  }
  const w = s.sim.world, name = w.name[i], rows = [];
  const add = (k, v) => rows.push(h("dt", { text: t(k) }), h("dd", { text: v }));
  if (i !== 0) {
    const el = elements(w, i, 0);
    add("info.distance", `${num(el.r.toFixed(4))} AU`);
    add("info.speed", `${num((el.speed * KMS_PER_AUD).toFixed(2))} km/s`);
    add("info.a", `${num(el.a.toFixed(5))} AU`);
    add("info.e", num(el.e.toFixed(5)));
    add("info.i", `${num((el.inc * 180 / Math.PI).toFixed(3))}°`);
    add("info.period", el.period < 800 ? `${num(el.period.toFixed(2))} ${t("time.day")}` : `${num((el.period / 365.25).toFixed(2))} ${t("time.year")}`);
  }
  add("info.mass", w.mass[i] > 0 ? `${formatValue(w.mass[i])} M☉` : t("info.tracer"));
  if (i >= 1 && i <= 8 && s.sim.ref) {
    const sample = s.sim.ref.epochIndex + Math.round(w.time / s.sim.ref.cadence);
    const e = s.sim.err[i - 1][sample];
    add("info.error", Number.isFinite(e) ? formatValue(e, "km") : "–");
  }
  const dot = h("i"); dot.style.background = renderer.styleOf(w, i).color;
  host.replaceChildren(
    h("h3", {}, dot, bodyName(name)),
    h("dl", { class: "kv" }, rows),
    h("button", { type: "button", class: "btn", text: t("info.unfollow"), onclick: () => select(-1) }));
}

function select(i) {
  renderer.selected = i;
  renderer.focus = i;
  if (i < 0) renderer.cam.target = [0, 0, 0];
  updateInfo();
}

// ------------------------------------------------------------ validation
function buildValidation() {
  charts.error?.destroy(); charts.gr?.destroy(); charts.energy?.destroy();
  charts.error = new LineChart($("chart-error"), {
    logY: true, floor: 1e-3, unit: "km", xUnit: t("val.years"), label: t("val.error"), height: 190, minSpan: 1,
    series: PLANET_NAMES.map((n) => ({ name: bodyName(n), color: PLANET_COLORS[n] })),
  });
  charts.gr = new LineChart($("chart-gr"), {
    unit: "″", xUnit: t("val.years"), label: t("val.mercury"), height: 150, minSpan: 1,
    series: [{ name: t("val.measured"), color: "#4c9dff" }, { name: t("val.grLine"), color: "#93a1b5", dash: true }],
  });
  charts.energy = new LineChart($("chart-energy"), {
    logY: true, floor: 1e-16, xUnit: t("val.years"), label: t("val.energy"), height: 130, minSpan: 1,
    series: [{ name: "|ΔE/E|", color: "#4c9dff" }],
  });
  const body = $("error-table").tBodies[0];
  body.replaceChildren(...PLANET_NAMES.map((n) => {
    const key = h("i"); key.style.background = PLANET_COLORS[n];
    return h("tr", {}, h("td", {}, key, bodyName(n)), h("td", { text: "–" }), h("td", { text: "–" }));
  }));
  // Precomputed matrix from the C++ core.
  const tb = state.table, m = $("matrix");
  m.replaceChildren(
    h("thead", {}, h("tr", {}, h("th", { text: t("sim.integrator") }), h("th", { text: "dt" }),
      tb.planets.map((p) => h("th", { text: bodyName(p).slice(0, 3) })), h("th", { text: "|ΔE/E|" }))),
    h("tbody", {}, tb.cases.map((c) => {
      const tag = !c.pn ? ` (${t("val.no1pn")})` : !c.emq ? ` (${t("val.noemq")})` : "";
      const last = c.checkpoints[c.checkpoints.length - 1];
      return h("tr", {}, h("td", { text: c.integrator + tag }), h("td", { text: num(c.dt) }),
        last.km.map((v) => h("td", { text: v === null ? "∞" : formatValue(v) })),
        h("td", { text: formatValue(c.max_energy_drift) }));
    })));
  $("retrieved").textContent = state.meta.retrieved;
}

function refreshValidation(force = false) {
  if (state.tab !== "val" || !state.real || !charts.error) return;
  const sim = state.real.sim, ref = sim.ref;
  const x = [], errs = PLANET_NAMES.map(() => []), en = [], gr = [], line = [];
  for (let s = sim.lo; s <= sim.hi; s++) {
    const yr = (s - ref.epochIndex) * ref.cadence / 365.25;
    x.push(yr);
    for (let p = 0; p < 8; p++) errs[p].push(sim.err[p][s]);
    en.push(sim.driftSeries[s]);
    gr.push(sim.grVarpi[s] * ARCSEC_PER_RADIAN); line.push(ACCEPTED_GR_PRECESSION * yr / 100);
  }
  charts.error.setData(x, errs);
  charts.energy.setData(x, [en]);
  charts.gr.setData(x, sim.twin ? [gr, line] : [[], line]);
  const sample = ref.epochIndex + Math.round(sim.world.time / ref.cadence);
  const rows = $("error-table").tBodies[0].rows;
  for (let p = 0; p < 8; p++) {
    const now = sim.err[p][Math.max(sim.lo, Math.min(sim.hi, sample))];
    rows[p].cells[1].textContent = formatValue(now, "km");
    rows[p].cells[2].textContent = formatValue(sim.maxErr[p], "km");
  }
  const r = sim.mercuryRates(), ready = r && r.spanYears >= 2;
  const unit = t("unit.arcsecCy");
  $("gr-value").textContent = !sim.twin ? "–" : ready ? `${num(r.gr.toFixed(2))} ${unit}` : t("val.measuring");
  $("varpi-sim").textContent = ready ? `${num(r.sim.toFixed(2))} ${unit} · ${t("val.over")} ${num(r.spanYears.toFixed(1))} ${t("time.year")}` : t("val.measuring");
  $("varpi-jpl").textContent = ready ? `${num(r.de441.toFixed(2))} ${unit}` : t("val.measuring");
  const c = state.cfg, name = { euler: "Euler", verlet: "Verlet", rk4: "RK4", yoshida4: "Yoshida 4", yoshida6: "Yoshida 6" }[c.method];
  $("val-config").textContent = `${name} · dt = ${num(c.dt)} ${t("time.day")}${c.pn ? " · 1PN" : ""}${c.emq ? " · E–M" : ""}${c.j2 ? " · J2" : ""}`;
}

// --------------------------------------------------------------- what if
const holeMass = () => 10 ** +$("bh-mass").value;
const holeScale = () => 10 ** +$("bh-scale").value;
const fmtMass = (m) => (m < 1000 ? num(m.toFixed(m < 10 ? 1 : 0)) : formatValue(m));
const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function addIntruder(kind) {
  const s = state.what, sim = s.sim, w = sim.world;
  if (sim.hole >= 0 && w.alive[sim.hole]) return;
  // Arrives from outside at a speed typical of a disc star.
  sim.hole = kind === "blackhole"
    ? w.add("Black hole", "blackhole", holeMass(), [-100, 18, 0, 0.018, 0, 0])
    : w.add("Passing star", "intruder", 1.0, [-250, 40, 0, 0.0115, 0, 0]);
  sim.holeDrawScale = kind === "blackhole" ? holeScale() : 0;
  computeAccelerations(w, sim.forces);
  renderer.reset(w);
  renderer.holeScale = sim.holeDrawScale;
  setPlaying(true);
  updateWhatIf();
}

function trackEjections(s) {
  const w = s.sim.world;
  for (let i = 1; i <= 8; i++) {
    if (!w.alive[i]) continue;
    const o = 3 * i, r = Math.hypot(w.pos[o] - w.pos[0], w.pos[o + 1] - w.pos[1], w.pos[o + 2] - w.pos[2]);
    const v2 = (w.vel[o] - w.vel[0]) ** 2 + (w.vel[o + 1] - w.vel[1]) ** 2 + (w.vel[o + 2] - w.vel[2]) ** 2;
    if (0.5 * v2 - G * w.mass[0] / r > 0) s.ejected.add(i); else s.ejected.delete(i);
  }
}

function updateWhatIf() {
  const s = state.what;
  if (!s) return;
  const m = holeMass(), rs = schwarzschildRadius(m) * AU_KM;
  $("bh-mass-v").textContent = `${fmtMass(m)} M☉`;
  const e = +$("bh-scale").value;
  $("bh-scale-v").textContent = e === 0 ? "×1" : "×10" + String(e).split("").map((d) => SUPER[+d]).join("");
  $("what-rs").textContent = formatValue(rs, "km");
  const names = (list) => (list.length ? list.map(bodyName).join(", ") : t("what.none"));
  $("what-eaten").textContent = names(s.sim.eaten);
  $("what-ejected").textContent = names([...s.ejected].map((i) => s.sim.world.name[i]));
  $("what-sub").textContent = String(s.sim.substeps);
}

// ----------------------------------------------------------------- input
function bindCanvas(cv) {
  const pointers = new Map();
  let moved = 0, pinch = 0;
  cv.addEventListener("pointerdown", (ev) => {
    cv.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    moved = 0; cv.classList.add("dragging");
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  cv.addEventListener("pointermove", (ev) => {
    const p = pointers.get(ev.pointerId);
    if (!p) return;
    const dx = ev.clientX - p[0], dy = ev.clientY - p[1];
    p[0] = ev.clientX; p[1] = ev.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 1) {
      renderer.cam.yaw -= dx * 0.006;
      renderer.cam.pitch = Math.max(-1.55, Math.min(1.55, renderer.cam.pitch + dy * 0.006));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && d > 0) zoom(pinch / d);
      pinch = d;
    }
  });
  const up = (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(ev.pointerId);
    if (!pointers.size) cv.classList.remove("dragging");
    if (wasSingle && moved < 6 && ev.type === "pointerup") {
      const r = cv.getBoundingClientRect();
      const hit = renderer.pick(ev.clientX - r.left, ev.clientY - r.top, ev.pointerType === "touch" ? 26 : 16);
      if (hit >= 0 || renderer.selected >= 0) select(hit);
    }
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (ev) => { ev.preventDefault(); zoom(Math.exp(ev.deltaY * 0.0012)); }, { passive: false });
  cv.addEventListener("keydown", (ev) => {
    const k = ev.key;
    if (k === "ArrowLeft") renderer.cam.yaw += 0.08;
    else if (k === "ArrowRight") renderer.cam.yaw -= 0.08;
    else if (k === "ArrowUp") renderer.cam.pitch = Math.min(1.55, renderer.cam.pitch + 0.06);
    else if (k === "ArrowDown") renderer.cam.pitch = Math.max(-1.55, renderer.cam.pitch - 0.06);
    else if (k === "+" || k === "=") zoom(0.85);
    else if (k === "-") zoom(1 / 0.85);
    else if (k === " ") setPlaying(!state.playing);
    else return;
    ev.preventDefault();
  });
}
function zoom(f) { renderer.cam.dist = Math.max(0.01, Math.min(600, renderer.cam.dist * f)); }

function bindUi() {
  for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => setTab(b.dataset.tab));
  for (const b of document.querySelectorAll(".lang button")) b.addEventListener("click", () => {
    try { localStorage.setItem("gravity-lab-lang", b.dataset.lang); } catch { /* private mode */ }
    setLang(b.dataset.lang);
  });
  $("play").addEventListener("click", () => { state.seek = null; setPlaying(!state.playing); });
  $("speed").addEventListener("change", (e) => { state.scene.speed = +e.target.value; state.acc = 0; });
  $("go").addEventListener("click", () => {
    const v = $("goto").value;
    if (!v) return;
    const [y, m, d] = v.split("-").map(Number);
    if (y < 1900 || y > 2100 || (y === 2100 && (m > 1 || d > 1))) { $("goto").reportValidity(); return; }
    seekTo(dateToJd(y, m, d) - state.scene.sim.epochJD, v);
  });
  for (const b of $("scale").children) b.addEventListener("click", () => {
    if (b.dataset.scale === renderer.scale) return;
    // Convert the camera distance so the same region stays in view.
    const d = renderer.cam.dist;
    renderer.cam.dist = b.dataset.scale === "log" ? 10 * Math.log10(1 + d / 0.25) * 1.15 : Math.min(120, 0.25 * (10 ** (d / 11.5) - 1));
    setScale(b.dataset.scale);
    renderer.cam.dist = Math.max(0.01, renderer.cam.dist);
  });
  $("view-reset").addEventListener("click", () => {
    const v = state.scene.view || { dist: 17, pitch: 0.62, yaw: -1.05 };
    select(-1);
    Object.assign(renderer.cam, { dist: renderer.scale === "log" ? 26 : v.dist, pitch: v.pitch, yaw: v.yaw, target: [0, 0, 0] });
    renderer.focus = v.focus ?? -1;
  });
  $("reset").addEventListener("click", () => {
    const s = state.scene;
    if (s.id === "real") restartReal();
    else if (s.id === "what") { state.what = buildWhatIf(); activate(state.what); updateWhatIf(); }
    else loadExperiment(s.id, s.variant);
  });

  for (const b of $("method").children) b.addEventListener("click", () => {
    state.cfg.method = b.dataset.m;
    for (const o of $("method").children) o.setAttribute("aria-pressed", String(o === b));
    methodNote(); restartReal();
  });
  $("dt").replaceChildren(...DT_CHOICES.map((v) => h("option", { value: String(v), selected: v === state.cfg.dt, text: String(v) })));
  $("dt").addEventListener("change", (e) => { state.cfg.dt = +e.target.value; restartReal(); });
  for (const [id, key] of [["f-pn", "pn"], ["f-emq", "emq"], ["f-j2", "j2"], ["d-minor", "minor"]])
    $(id).addEventListener("change", (e) => { state.cfg[key] = e.target.checked; restartReal(); });
  for (const key of Object.keys(state.show))
    $("d-" + key).addEventListener("change", (e) => {
      state.show[key] = e.target.checked;
      if (state.scene.id === "real") renderer.show[key] = e.target.checked;
      if (key === "trails" && e.target.checked) renderer.clearTrails();
      updateChrome();
    });
  $("run100").addEventListener("click", () => {
    const sim = state.real.sim;
    if (sim.world.time >= 36512 - 1) restartReal();
    seekTo(36512, "2099-12-19");
  });

  $("exp-list").replaceChildren(...EXPERIMENTS.map((e) => h("button", {
    type: "button", "data-exp": e.id, "aria-pressed": "false", onclick: () => loadExperiment(e.id),
  }, h("b", { "data-i18n": `exp.${e.id}.title`, text: t(`exp.${e.id}.title`) }),
     h("span", { "data-i18n": `exp.${e.id}.sub`, text: t(`exp.${e.id}.sub`) }))));

  $("bh-mass").addEventListener("input", updateWhatIf);
  $("bh-scale").addEventListener("input", () => {
    const s = state.what;
    if (s && s.sim.hole >= 0 && s.sim.world.kind[s.sim.hole] === "blackhole") {
      s.sim.holeDrawScale = holeScale(); renderer.holeScale = holeScale();
    }
    updateWhatIf();
  });
  $("bh-drop").addEventListener("click", () => addIntruder("blackhole"));
  $("star-drop").addEventListener("click", () => addIntruder("intruder"));
  $("what-reset").addEventListener("click", () => { state.what = buildWhatIf(); activate(state.what); updateWhatIf(); });

  addEventListener("resize", () => renderer.resize());
  new ResizeObserver(() => renderer.resize()).observe($("view"));
}

function methodNote() {
  const m = INTEGRATORS[state.cfg.method];
  $("method-note").textContent = `${t("sim.order")} ${m.order} · ${t(m.symplectic ? "sim.symplectic" : "sim.notSymplectic")}`;
}

// ------------------------------------------------------------------ loop
// If frames run long, trade resolution for smoothness: first the canvas
// pixel ratio, then the faintest stars. Never goes back up, so it settles.
const quality = { ema: 16.7, frames: 0 };
function adaptQuality(dtFrame) {
  if (document.hidden) return;
  quality.ema += (dtFrame * 1000 - quality.ema) * 0.05;
  if (++quality.frames < 90 || quality.ema < 22) return;
  quality.frames = 0; quality.ema = 16.7;
  if (renderer.dprCap > 1) { renderer.dprCap = Math.max(1, renderer.dprCap - 0.5); renderer.resize(); }
  else if (renderer.maxStarMag > 4.2) renderer.maxStarMag -= 0.6;
}

function frame(now) {
  const dtFrame = Math.min(0.1, (now - state.last) / 1000 || 0.016);
  state.last = now;
  const s = state.scene;
  adaptQuality(dtFrame);
  advance(dtFrame);
  if (s.markers) renderer.markers = s.markers(renderer); else renderer.markers = [];
  renderer.draw(s.sim.world, { perihelionOf: s.perihelionOf ?? -1, perihelionLabel: `${t("body.Mercury")} · ${getLang() === "es" ? "perihelio" : "perihelion"}`, labelAll: s.labelAll });
  updateHud();
  if (now - state.lastPanel > 250) {
    state.lastPanel = now;
    if (state.tab === "val") refreshValidation();
    else if (state.tab === "exp" && state.exp) state.exp.updatePanel();
    else if (state.tab === "what") updateWhatIf();
    else if (renderer.selected >= 0) updateInfo();
  }
  requestAnimationFrame(frame);
}

async function main() {
  renderer = new Renderer($("view"));
  renderer.nameOf = bodyName;
  if (smallScreen()) renderer.maxStarMag = 4.8;
  window.__gl = { state, get renderer() { return renderer; } };   // for tests and the console
  bindCanvas($("view"));
  try {
    await load();
  } catch (err) {
    const st = $("status"); st.dataset.sticky = "1"; st.textContent = t("loadError"); st.hidden = false;
    console.error(err);
    return;
  }
  bindUi();
  setLang(initialLang());
  for (const b of document.querySelectorAll(".lang button")) b.setAttribute("aria-pressed", String(b.dataset.lang === getLang()));
  state.real = buildReal();
  activate(state.real);
  buildValidation();
  methodNote();
  setPlaying(state.playing);
  if (reducedMotion) {
    const st = $("status"); st.textContent = t("reduced"); st.hidden = false; st.dataset.sticky = "1";
    $("play").addEventListener("click", () => { delete st.dataset.sticky; st.hidden = true; }, { once: true });
  } else $("status").hidden = true;

  onLangChange(() => {
    for (const b of document.querySelectorAll(".lang button")) b.setAttribute("aria-pressed", String(b.dataset.lang === getLang()));
    buildSpeedOptions(); buildValidation(); refreshValidation(true); methodNote(); updateChrome(); updateInfo();
    setPlaying(state.playing);
    if (state.exp) state.exp.buildPanel($("exp-body"));
    updateWhatIf();
    document.title = getLang() === "es"
      ? "gravity-lab · sistema solar de N cuerpos validado contra JPL Horizons"
      : "gravity-lab · N-body Solar System validated against JPL Horizons";
  });
  requestAnimationFrame(frame);
}

main();
