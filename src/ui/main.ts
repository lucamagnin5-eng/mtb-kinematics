// Interface de l'atelier : vue vélo éditable, courbes et tableau de géométrie.
// La couche d'affichage reste volontairement peu typée ; le calcul vit dans src/core.

import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import { CHAINRINGS, COGS, FORKS, IDLERS, SHOCKS, TIRE_WIDTHS, WHEELS, forkA2C, forkOffsets, type ShockMount, type WheelSize } from "../core/catalog";
import { fitShock, readFrame, setIdler, writeFrame, type FrameDims } from "../core/frame";
import { forkSagMM, frontRadius, geometry, groundFor, rearRadius, sweep } from "../core/kinematics";
import { LAYOUTS, makeModel } from "../core/presets";
import type { BikeModel } from "../core/types";
import { openText, saveText } from "./io";
import { stepBodies, toStep } from "../core/step";


// ---------- État ----------
const $ = (id: string) => document.getElementById(id) as any;
let model: BikeModel, res: any, poseIdx = 0, sagIdx = 0, drag: any = null, hoverPt: string | null = null;
let forkComp = 0; // compression de fourche affichée (mm), indépendante de l'arrière
const show = { ic: true, as: true, ar: true, path: true, chain: true, labels: false };
const STORE = "mtb-kin-model-v2";

function load() {
  try { const s = localStorage.getItem(STORE); if (s) { const m = JSON.parse(s); if (m && m.version === 2) return m; } } catch (e) {}
  return makeModel("horst");
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(model)); } catch (e) {} }

// ---------- Champs ----------
const opt = (v: any, label: any, sel: boolean) => `<option value="${v}"${sel ? " selected" : ""}>${label}</option>`;
const num = (id: string, label: string, value: number, step = 0.5) =>
  `<label>${label}<input id="${id}" type="number" step="${step}" value="${+value.toFixed(2)}"></label>`;
const sel = (id: string, label: string, options: string, cls = "") => `<label class="${cls}">${label}<select id="${id}">${options}</select></label>`;
function onNum(id: string, fn: (v: number) => void, min = -Infinity) {
  $(id).addEventListener("change", e => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= min) { fn(v); changed(); } else buildFields(); });
}
function onSel(id: string, fn: (v: string) => void) { $(id).addEventListener("change", e => { fn(e.target.value); changed(); }); }
/** Après une modification : recalcul, puis mise à jour des champs dépendants. */
function changed(rebuild = true) { forkComp = Math.min(forkComp, model.setup.fork.travel); recompute(true); if (rebuild) { buildFields(); buildPoints(); } }

const FRAME_FIELDS: [keyof FrameDims, string, number][] = [
  ["reach", "Reach (mm)", 1], ["stack", "Stack (mm)", 1], ["headAngle", "Head angle (°)", 0.1], ["headTube", "Head tube length (mm)", 1],
  ["seatAngle", "Seat angle, actual (°)", 0.1], ["seatTube", "Seat tube length (mm)", 1], ["chainstay", "Chainstay (mm)", 1], ["bbDrop", "BB drop (mm)", 1],
];
function buildFields() {
  const g = model.setup, f = readFrame(model);
  $("presetDesc").textContent = model.preset && LAYOUTS[model.preset] ? LAYOUTS[model.preset].description : "Custom layout";
  $("f-frame").innerHTML = FRAME_FIELDS.map(([k, l, st]) => num("fr-" + k, l, f[k], st)).join("");
  FRAME_FIELDS.forEach(([k]) => onNum("fr-" + k, v => writeFrame(model, k, v)));

  const sizes = SHOCKS[g.shock.mount].sizes;
  $("f-shock").innerHTML =
    sel("sh-mount", "Mount", (Object.keys(SHOCKS) as ShockMount[]).map(k => opt(k, SHOCKS[k].label, k === g.shock.mount)).join("")) +
    sel("sh-size", "Size (eye-to-eye × stroke)", sizes.map(([e, s], i) => opt(i, `${e} × ${s}`, e === g.shock.eye2eye && s === g.shock.stroke)).join("") +
      (sizes.some(([e, s]) => e === g.shock.eye2eye && s === g.shock.stroke) ? "" : opt(-1, `${g.shock.eye2eye} × ${g.shock.stroke} (custom)`, true))) +
    num("sh-sag", "Sag (% stroke)", g.sag, 1);
  onSel("sh-mount", v => {
    // Nouvelle famille : on garde la taille dont la course est la plus proche.
    const list = SHOCKS[v as ShockMount].sizes;
    const [e, s] = list.reduce((a, b) => (Math.abs(b[1] - g.shock.stroke) < Math.abs(a[1] - g.shock.stroke) ? b : a));
    fitShock(model, v as ShockMount, e, s);
  });
  onSel("sh-size", v => { if (+v >= 0) fitShock(model, g.shock.mount, ...sizes[+v]); });
  onNum("sh-sag", v => (g.sag = v), 0);

  const fk = g.fork, wf = g.wheels.front, isCustom = !(fk.model in FORKS);
  $("f-fork").innerHTML =
    sel("fk-model", "Model", Object.entries(FORKS).map(([k, f]) => opt(k, f.name, k === fk.model)).join("") + opt("custom", "Custom", isCustom), "full") +
    (isCustom
      ? num("fk-travel", "Travel (mm)", fk.travel, 5) + num("fk-a2c", "Axle-to-crown (mm)", fk.a2c, 1) + num("fk-offset", "Offset (mm)", fk.offset, 1)
      : sel("fk-travel", "Travel (mm)", FORKS[fk.model].travels.map(t => opt(t, t, t === fk.travel)).join("")) +
        sel("fk-offset", "Offset (mm)", forkOffsets(fk.model, wf).map(o => opt(o, o, o === fk.offset)).join("")) +
        `<label>Axle-to-crown<output>${fk.a2c.toFixed(1)} mm</output></label>`) +
    num("fk-sag", "Sag (% travel)", fk.sag, 1);
  onSel("fk-model", v => {
    if (v === "custom") { fk.model = "custom"; return; }
    const f = FORKS[v];
    fk.model = v;
    fk.travel = f.travels.reduce((a, b) => (Math.abs(b - fk.travel) < Math.abs(a - fk.travel) ? b : a));
    const offs = forkOffsets(v, wf);
    if (!offs.includes(fk.offset)) fk.offset = offs[0];
    fk.a2c = forkA2C(v, wf, fk.travel);
    forkComp = forkSagMM(model);
  });
  if (isCustom) {
    onNum("fk-travel", v => { fk.travel = v; forkComp = forkSagMM(model); }, 1);
    onNum("fk-a2c", v => (fk.a2c = v), 100);
    onNum("fk-offset", v => (fk.offset = v), 0);
  } else {
    onSel("fk-travel", v => { fk.travel = +v; fk.a2c = forkA2C(fk.model, wf, fk.travel); forkComp = forkSagMM(model); });
    onSel("fk-offset", v => (fk.offset = +v));
  }
  onNum("fk-sag", v => { fk.sag = v; forkComp = forkSagMM(model); }, 0);

  const w = g.wheels, wheelOpts = (cur: WheelSize) => (Object.keys(WHEELS) as WheelSize[]).map(k => opt(k, WHEELS[k].label, k === cur)).join("");
  const tireOpts = (cur: number) => TIRE_WIDTHS.map(t => opt(t, `${t}"`, t === cur)).join("");
  $("f-wheels").innerHTML =
    sel("wh-front", "Front wheel", wheelOpts(w.front)) + sel("wh-ftire", "Front tyre", tireOpts(w.frontTire)) +
    sel("wh-rear", "Rear wheel", wheelOpts(w.rear)) + sel("wh-rtire", "Rear tyre", tireOpts(w.rearTire)) +
    `<label class="full">Outside radius<output>front ${frontRadius(model).toFixed(1)} mm · rear ${rearRadius(model).toFixed(1)} mm</output></label>`;
  onSel("wh-front", v => { w.front = v as WheelSize; if (fk.model in FORKS) { fk.a2c = forkA2C(fk.model, w.front, fk.travel); const o = forkOffsets(fk.model, w.front); if (!o.includes(fk.offset)) fk.offset = o[0]; } });
  onSel("wh-ftire", v => (w.frontTire = +v));
  onSel("wh-rear", v => (w.rear = v as WheelSize));
  onSel("wh-rtire", v => (w.rearTire = +v));

  const teeth = (list: number[], cur: number) => list.map(t => opt(t, t, t === cur)).join("") + (list.includes(cur) ? "" : opt(cur, cur, true));
  $("f-drive").innerHTML =
    sel("dr-ring", "Chainring", teeth(CHAINRINGS, g.chainring)) +
    g.cogs.map((c, i) => sel("dr-cog" + i, `Cog ${i + 1}`, teeth(COGS, c))).join("") +
    `<label class="check full"><input type="checkbox" id="dr-idler" ${model.idler ? "checked" : ""}> Idler pulley</label>` +
    (model.idler ? sel("dr-idlerT", "Idler teeth", teeth(IDLERS, g.idlerTeeth)) : "");
  onSel("dr-ring", v => (g.chainring = +v));
  g.cogs.forEach((_, i) => onSel("dr-cog" + i, v => (g.cogs[i] = +v)));
  $("dr-idler").addEventListener("change", e => { setIdler(model, e.target.checked); changed(); });
  if (model.idler) onSel("dr-idlerT", v => (g.idlerTeeth = +v));

  $("f-rider").innerHTML = num("rd-cog", "CoG height (mm)", g.cogHeight, 10) + num("rd-saddle", "Saddle height (mm)", g.saddleHeight, 5);
  onNum("rd-cog", v => (g.cogHeight = v), 1);
  onNum("rd-saddle", v => (g.saddleHeight = v), 1);
}
function buildPoints() {
  $("pts").innerHTML = Object.entries(model.points).map(([id, p]) =>
    `<tr data-id="${id}"><td><span class="k ${p.fixed ? "fix" : "mov"}"></span>${p.label}</td>
     <td><input id="px-${id}" type="number" step="0.1" value="${p.x.toFixed(1)}" aria-label="${p.label} x"></td>
     <td><input id="py-${id}" type="number" step="0.1" value="${p.y.toFixed(1)}" aria-label="${p.label} y"></td></tr>`).join("");
  for (const id of Object.keys(model.points)) for (const a of ["x", "y"]) {
    $(`p${a}-${id}`).addEventListener("change", e => {
      const v = parseFloat(e.target.value); if (!isFinite(v)) return;
      model.points[id][a] = v; changed();
    });
  }
}
function syncPointInputs() {
  for (const [id, p] of Object.entries(model.points)) {
    const ix = $("px-" + id), iy = $("py-" + id);
    if (ix && document.activeElement !== ix) ix.value = p.x.toFixed(1);
    if (iy && document.activeElement !== iy) iy.value = p.y.toFixed(1);
  }
}

// ---------- Calcul ----------
function recompute(persist) {
  const r = sweep(model, { forkComp });
  if (!r.error || !res || res.error) res = r; // garde la dernière pose valide à l'écran
  const err = $("err");
  if (r.error) { err.hidden = false; err.textContent = r.error; }
  else if (!res.complete) { err.hidden = false; err.textContent = `The linkage locks after ${res.total.toFixed(1)} mm: the full shock stroke is not reached.`; }
  else err.hidden = true;
  if (!res.error) {
    const target = model.setup.sag / 100 * model.setup.shock.stroke;
    sagIdx = res.poses.findIndex(p => res.L0 - p.shock >= target);
    if (sagIdx < 0) sagIdx = res.poses.length - 1;
    poseIdx = Math.min(poseIdx, res.poses.length - 1);
  }
  if (persist) save();
  syncPointInputs();
  render();
}

// ---------- Dessin ----------
const css = () => { const s = getComputedStyle(document.documentElement); const g = k => s.getPropertyValue(k).trim();
  return { ink: g("--ink"), muted: g("--muted"), line: g("--line"), grid: g("--grid"), panel: g("--panel"), bg: g("--bg"), accent: g("--accent"), soft: g("--accent-soft"),
    frame: g("--frame"), shock: g("--shock"), ic: g("--ic"), s: [g("--s1"), g("--s2"), g("--s3")], tire: g("--tire"), rim: g("--rim"), mono: g("--f-mono"), body: g("--f-body") }; };

function fitCanvas(c) {
  const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0); return { ctx, w: r.width, h: r.height };
}

let view: any = null; // transformation monde(sol) -> écran
function drawBike() {
  const c = $("bike"), { ctx, w, h } = fitCanvas(c), C = css();
  ctx.clearRect(0, 0, w, h);
  if (!res || res.error) return;
  const pose = drag ? drag.pose : res.poses[poseIdx];
  const T = drag ? drag.T : pose.T;
  const P = id => T.fwd(pose.P[id] || model.points[id]);
  const g = model.setup, A = P(model.axle), F = T.fwd(res.F), Rr = rearRadius(model), Rf = frontRadius(model);
  // Cadrage fixe calculé à l'état détendu pour éviter que la vue saute.
  if (!view || !drag) {
    const p0 = res.poses[0], T0 = p0.T;
    const xs = [T0.fwd(p0.P[model.axle]).x - Rr, T0.fwd(res.F).x + Rf];
    const ymax = Math.max(g.cogHeight + 40, ...Object.values(model.points).map(p => T0.fwd(p).y)) + 30;
    const x0 = xs[0] - 40, x1 = xs[1] + 40, y0 = -40;
    const s = Math.min(w / (x1 - x0), h / (ymax - y0));
    const ox = (w - (x1 - x0) * s) / 2 - x0 * s, oy = h - (h - (ymax - y0) * s) / 2 + y0 * s;
    view = { s, ox, oy };
  }
  const S = p => [view.ox + p.x * view.s, view.oy - p.y * view.s];
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...S(a)); ctx.lineTo(...S(b)); ctx.stroke(); };
  const circle = (p, r) => { ctx.beginPath(); ctx.arc(...S(p), r * view.s, 0, Math.PI * 2); ctx.stroke(); };
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // Sol + hauteur du centre de gravité
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  line({ x: -2000, y: 0 }, { x: 3000, y: 0 });
  ctx.setLineDash([4, 4]); line({ x: pose.front.x - 140, y: g.cogHeight }, { x: pose.front.x + 60, y: g.cogHeight }); ctx.setLineDash([]);
  ctx.fillStyle = C.muted; ctx.font = `11px ${C.mono}`; ctx.fillText("CoG", ...S({ x: pose.front.x - 136, y: g.cogHeight + 14 }));
  ctx.strokeStyle = C.grid; line(pose.front, { x: pose.front.x, y: g.cogHeight + 60 });

  // Roues
  ctx.strokeStyle = C.tire; ctx.lineWidth = Math.max(3, 55 * view.s);
  ctx.globalAlpha = .18; circle(A, Rr - 28); circle(F, Rf - 28); ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5; circle(A, Rr); circle(F, Rf);
  ctx.strokeStyle = C.rim; ctx.lineWidth = 1; circle(A, Rr - 60); circle(F, Rf - 60);

  // Transmission
  if (show.chain && res.r1) {
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    circle(P("BB"), res.r1); circle(A, res.cogR[1]);
    if (model.idler) circle(P(model.idler), 12.7 / (2 * Math.sin(Math.PI / g.idlerTeeth)));
    ctx.strokeStyle = C.s[1]; ctx.lineWidth = 2;
    for (const seg of pose.chain[1]) line(seg.t1, seg.t2);
  }

  // Trajectoire d'axe
  if (show.path) {
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath();
    res.poses.forEach((p, i) => { const q = T.fwd(p.P[model.axle]); i ? ctx.lineTo(...S(q)) : ctx.moveTo(...S(q)); });
    ctx.stroke(); ctx.setLineDash([]);
  }

  // Cadre
  const ht = P(model.headTop), hb = P(model.headBottom), bb = P("BB"), st = P(model.seatTop), sb = P(model.seatBottom);
  ctx.strokeStyle = C.frame; ctx.lineWidth = Math.max(3, 32 * view.s);
  line(bb, sb); line(sb, st); line(st, ht); line(hb, bb); ctx.lineWidth = Math.max(4, 40 * view.s); line(ht, hb);
  // Fourche
  ctx.lineWidth = Math.max(3, 30 * view.s); ctx.strokeStyle = C.muted; line(hb, F);
  // Pattes du cadre vers les pivots fixes
  const tubes = [[bb, sb], [sb, st], [st, ht], [hb, bb]];
  ctx.strokeStyle = C.frame; ctx.lineWidth = Math.max(2, 14 * view.s);
  for (const [id, p] of Object.entries(model.points)) {
    if (!p.fixed || ["BB", model.headTop, model.headBottom, model.seatTop, model.seatBottom].includes(id)) continue;
    const q = P(id); let best: any = null, bd = Infinity;
    for (const [a, b] of tubes) { const d = { x: b.x - a.x, y: b.y - a.y }, t = Math.max(0, Math.min(1, ((q.x - a.x) * d.x + (q.y - a.y) * d.y) / (d.x * d.x + d.y * d.y)));
      const r = { x: a.x + t * d.x, y: a.y + t * d.y }, dd = Math.hypot(r.x - q.x, r.y - q.y); if (dd < bd) { bd = dd; best = r; } }
    if (best) line(q, best);
  }

  // Corps mobiles
  ctx.lineWidth = Math.max(2.5, 18 * view.s);
  for (const body of model.bodies) {
    const pts = body.map(P);
    ctx.fillStyle = C.soft; ctx.strokeStyle = C.accent;
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(...S(q)) : ctx.moveTo(...S(q))); ctx.closePath();
    if (pts.length > 2) ctx.fill(); ctx.stroke();
  }
  // Amortisseur
  const [sa, sbk] = model.shock, a = P(sa), b = P(sbk);
  ctx.strokeStyle = C.shock; ctx.lineWidth = Math.max(4, 26 * view.s); line(a, { x: a.x + (b.x - a.x) * .55, y: a.y + (b.y - a.y) * .55 });
  ctx.lineWidth = Math.max(2, 12 * view.s); line(a, b);

  // Lignes anti-squat / anti-rise et CIR
  const ext = (p0, p1) => { const t = (pose.front.x + 80 - p0.x) / (p1.x - p0.x); return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }; };
  ctx.lineWidth = 1.5;
  if (show.ar && pose.ic) { ctx.strokeStyle = C.s[2]; ctx.setLineDash([6, 4]); line(pose.rear, ext(pose.rear, pose.ic)); ctx.setLineDash([]); }
  if (show.as && pose.ifc[1]) {
    ctx.strokeStyle = C.s[0]; line(pose.rear, ext(pose.rear, pose.ifc[1]));
    ctx.strokeStyle = C.grid; ctx.setLineDash([3, 3]); if (pose.ic) line(A, pose.ic); ctx.setLineDash([]);
    ctx.fillStyle = C.s[0]; ctx.beginPath(); ctx.arc(...S(pose.ifc[1]), 4, 0, 7); ctx.fill();
  }
  if (show.ic && pose.ic) {
    const [x, y] = S(pose.ic); ctx.strokeStyle = C.ic; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
    ctx.fillStyle = C.ic; ctx.font = `600 11px ${C.mono}`; ctx.fillText("IC", x + 10, y - 10);
  }

  // Pivots
  for (const [id, p] of Object.entries(model.points)) {
    const [x, y] = S(P(id)), on = hoverPt === id || (drag && drag.id === id);
    ctx.lineWidth = 2;
    if (p.fixed) { ctx.fillStyle = C.panel; ctx.strokeStyle = C.frame; ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); }
    else { ctx.fillStyle = C.panel; ctx.strokeStyle = C.accent; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
    if (on || show.labels) {
      if (on) { ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke(); }
      ctx.font = `600 12px ${C.body}`; const t = p.label, tw = ctx.measureText(t).width;
      ctx.fillStyle = C.panel; ctx.globalAlpha = .85; ctx.fillRect(x + 10, y - 22, tw + 8, 17); ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink; ctx.fillText(t, x + 14, y - 9);
    }
  }
}

// ---------- Courbes ----------
const CHARTS: any[] = [
  { id: "lr", title: "Leverage ratio", unit: "", dec: 2, series: () => [{ name: "Leverage", get: p => p.leverage }] },
  { id: "as", title: "Anti-squat", unit: "%", dec: 0, series: () => model.setup.cogs.map((n, k) => ({ name: `${model.setup.chainring}×${n}`, get: p => p.antiSquat[k] })), ref: 100 },
  { id: "ar", title: "Anti-rise", unit: "%", dec: 0, series: () => [{ name: "Anti-rise", get: p => p.antiRise }], ref: 100, color: 2 },
  { id: "kb", title: "Pedal kickback", unit: "°", dec: 1, series: () => model.setup.cogs.map((n, k) => ({ name: `${model.setup.chainring}×${n}`, get: p => p.kickback[k] })) },
  { id: "ap", title: "Axle path (rearward)", unit: "mm", dec: 1, series: () => [{ name: "Rearward", get: p => -p.axleX }] },
  { id: "sh", title: "Shock stroke used", unit: "mm", dec: 1, series: () => [{ name: "Stroke", get: p => res.L0 - p.shock }] },
];
function buildCharts() {
  $("charts").innerHTML = CHARTS.map(c => `<section class="panel chart" id="ch-${c.id}"><h3>${c.title}</h3><div class="sub" id="sub-${c.id}"></div><canvas id="cv-${c.id}"></canvas><div class="tip" hidden id="tip-${c.id}"></div></section>`).join("");
  for (const c of CHARTS) {
    const cv = $("cv-" + c.id);
    cv.addEventListener("pointermove", e => { c.hover = e.offsetX; drawChart(c); });
    cv.addEventListener("pointerleave", () => { c.hover = null; $("tip-" + c.id).hidden = true; drawChart(c); });
    cv.addEventListener("click", e => { const i = c.idxAt?.(e.offsetX); if (i != null) { poseIdx = i; render(); } });
  }
}
function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) ?? 10 * mag;
  const ticks: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { ticks, step };
}
function drawChart(c) {
  const cv = $("cv-" + c.id); const { ctx, w, h } = fitCanvas(cv), C = css();
  ctx.clearRect(0, 0, w, h);
  if (!res || res.error) return;
  const ser = c.series(), ps = res.poses;
  const cols = ser.length > 1 ? C.s : [C.s[c.color ?? 0]];
  $("sub-" + c.id).innerHTML = ser.length > 1 ? ser.map((s, k) => `<span><i style="background:${cols[k]}"></i>${s.name}</span>`).join("") : "";
  let lo = Infinity, hi = -Infinity;
  for (const s of ser) for (const p of ps) { const v = s.get(p); if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  if (c.ref != null && lo < c.ref * 1.4 && hi > c.ref * .4) { lo = Math.min(lo, c.ref); hi = Math.max(hi, c.ref); }
  if (!isFinite(lo)) return;
  const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
  const { ticks } = niceTicks(lo, hi);
  const L = 42, R = 10, Tp = 8, B = 24, X = t => L + (t / res.total) * (w - L - R), Y = v => Tp + (1 - (v - lo) / (hi - lo)) * (h - Tp - B);
  ctx.font = `11px ${C.mono}`; ctx.fillStyle = C.muted; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (const t of ticks) { const y = Math.round(Y(t)) + .5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.textAlign = "right"; ctx.fillText(String(+t.toFixed(2)), L - 6, y + 4); }
  const xt = niceTicks(0, res.total, 4).ticks; ctx.textAlign = "center";
  for (const t of xt) ctx.fillText(String(t), X(t), h - 8);
  ctx.textAlign = "left";
  if (c.ref != null && c.ref > lo && c.ref < hi) { ctx.strokeStyle = C.muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L, Y(c.ref)); ctx.lineTo(w - R, Y(c.ref)); ctx.stroke(); ctx.setLineDash([]); }
  // Zone de sag
  const sx = X(ps[sagIdx].travel); ctx.fillStyle = C.grid; ctx.globalAlpha = .55; ctx.fillRect(L, Tp, sx - L, h - Tp - B); ctx.globalAlpha = 1;
  ctx.fillStyle = C.muted; ctx.fillText("sag", sx - 24, Tp + 12);
  ser.forEach((s, k) => {
    ctx.strokeStyle = cols[k]; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
    for (const p of ps) { const v = s.get(p); if (!isFinite(v)) { started = false; continue; } started ? ctx.lineTo(X(p.travel), Y(v)) : ctx.moveTo(X(p.travel), Y(v)); started = true; }
    ctx.stroke();
  });
  // Position courante
  const cur = ps[poseIdx]; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(cur.travel), Tp); ctx.lineTo(X(cur.travel), h - B); ctx.stroke();
  ser.forEach((s, k) => { const v = s.get(cur); if (isFinite(v)) { ctx.fillStyle = cols[k]; ctx.strokeStyle = C.panel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(cur.travel), Y(v), 4.5, 0, 7); ctx.fill(); ctx.stroke(); } });
  c.idxAt = x => { const t = ((x - L) / (w - L - R)) * res.total; if (t < -5 || t > res.total + 5) return null; let bi = 0, bd = Infinity; ps.forEach((p, i) => { const d = Math.abs(p.travel - t); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const tip = $("tip-" + c.id);
  if (c.hover != null) {
    const i = c.idxAt(c.hover); if (i == null) { tip.hidden = true; return; }
    const p = ps[i], x = X(p.travel);
    ctx.strokeStyle = C.muted; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x, Tp); ctx.lineTo(x, h - B); ctx.stroke(); ctx.setLineDash([]);
    tip.hidden = false;
    tip.innerHTML = `${p.travel.toFixed(1)} mm<br>` + ser.map(s => `${ser.length > 1 ? s.name + " " : ""}<b>${fmt(s.get(p), c.dec)}</b>${c.unit}`).join("<br>");
    const box = cv.parentElement.getBoundingClientRect(), cb = cv.getBoundingClientRect();
    const left = cb.left - box.left + x + 12, tw = tip.offsetWidth;
    tip.style.left = (left + tw > box.width - 4 ? left - tw - 24 : left) + "px"; tip.style.top = (cb.top - box.top + 6) + "px";
  } else tip.hidden = true;
}
const fmt = (v, d) => isFinite(v) ? v.toFixed(d).replace("-", "−") : "—";

// ---------- Géométrie ----------
function renderGeo() {
  if (!res || res.error) { $("geo").innerHTML = ""; return; }
  const col = (P, fc: number) => { const { F, T } = groundFor(model, P, fc); return geometry(model, P, T, F); };
  const g0 = col(res.poses[0].P, 0), gs = col(res.poses[sagIdx].P, forkSagMM(model)), gc = col(res.poses[poseIdx].P, forkComp);
  const cell = (r) => `<td>${fmt(r[0], 1)}${r[1] === "°" ? "°" : ""}</td>`;
  $("geo").innerHTML = `<tr><th>Measure</th><th>Static</th><th>Sag</th><th>Current</th></tr>` +
    Object.keys(g0).map(k => `<tr><td>${k}</td>${cell(g0[k])}${cell(gs[k])}${cell(gc[k])}</tr>`).join("");
}
function renderReadout() {
  if (!res || res.error) { $("read").innerHTML = ""; return; }
  const p = res.poses[poseIdx], comp = res.L0 - p.shock;
  $("travel").max = res.poses.length - 1; $("travel").value = poseIdx;
  const k = 1;
  $("forkComp").max = model.setup.fork.travel; $("forkComp").value = forkComp;
  $("read").innerHTML = [
    ["Wheel", `${p.travel.toFixed(1)} / ${res.total.toFixed(1)} mm`],
    ["Shock", `${comp.toFixed(1)} mm (${(comp / model.setup.shock.stroke * 100).toFixed(0)} %)`],
    ["Fork", `${forkComp.toFixed(1)} / ${model.setup.fork.travel} mm`],
    ["Leverage", fmt(p.leverage, 2)],
    [`AS ${model.setup.chainring}×${model.setup.cogs[k]}`, fmt(p.antiSquat[k], 0) + " %"],
    ["AR", fmt(p.antiRise, 0) + " %"],
  ].map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join("");
}
function render() { drawBike(); for (const c of CHARTS) drawChart(c); renderGeo(); renderReadout(); }

// ---------- Glisser les pivots ----------
function screenToWorld(e) { const r = $("bike").getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.s, y: (view.oy - (e.clientY - r.top)) / view.s }; }
function pickPoint(e) {
  if (!res || !view || res.error) return null;
  const pose = res.poses[poseIdx], T = pose.T, r = $("bike").getBoundingClientRect();
  let best: string | null = null, bd = 14;
  for (const id of Object.keys(model.points)) {
    const q = T.fwd(pose.P[id] || model.points[id]), x = view.ox + q.x * view.s, y = view.oy - q.y * view.s;
    const d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top)); if (d < bd) { bd = d; best = id; }
  }
  return best;
}
$("bike").addEventListener("pointerdown", e => {
  const id = pickPoint(e); if (!id) return;
  poseIdx = 0; const p0 = res.poses[0];
  drag = { id, T: p0.T, pose: p0 }; $("bike").setPointerCapture(e.pointerId); render();
});
$("bike").addEventListener("pointermove", e => {
  if (!drag) { const h = pickPoint(e); if (h !== hoverPt) { hoverPt = h; $("bike").style.cursor = h ? "grab" : "crosshair"; markRow(h); drawBike(); } return; }
  const w = drag.T.inv(screenToWorld(e)); model.points[drag.id].x = Math.round(w.x * 2) / 2; model.points[drag.id].y = Math.round(w.y * 2) / 2;
  const r = sweep(model, { forkComp });
  if (!r.error) { res = r; drag.pose = (r as any).poses[0]; }
  else drag.pose = { ...drag.pose, P: { ...drag.pose.P, [drag.id]: { ...model.points[drag.id] } } };
  $("err").hidden = !r.error; if (r.error) $("err").textContent = r.error;
  syncPointInputs(); drawBike();
});
const endDrag = () => { if (!drag) return; drag = null; changed(); };
$("bike").addEventListener("pointerup", endDrag); $("bike").addEventListener("pointercancel", endDrag);
function markRow(id) { document.querySelectorAll("#pts tr").forEach(tr => tr.classList.toggle("hl", (tr as HTMLElement).dataset.id === id)); }

// ---------- Interface ----------
$("travel").addEventListener("input", e => { poseIdx = +e.target.value; render(); });
$("forkComp").addEventListener("input", e => { forkComp = +e.target.value; recompute(false); });
$("preset").innerHTML = Object.entries(LAYOUTS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("");
$("preset").addEventListener("change", e => applyModel(makeModel(e.target.value)));
$("btnReset").addEventListener("click", () => applyModel(makeModel($("preset").value)));
const TG = [["ic", "Instant centre"], ["as", "Anti-squat line"], ["ar", "Anti-rise line"], ["path", "Axle path"], ["chain", "Chain"], ["labels", "Point names"]];
$("toggles").innerHTML = TG.map(([k, l]) => `<label><input type="checkbox" id="tg-${k}" ${show[k] ? "checked" : ""}>${l}</label>`).join("");
TG.forEach(([k]) => $("tg-" + k).addEventListener("change", e => { show[k] = e.target.checked; drawBike(); }));

function csv() {
  const s = model.setup, head = ["wheel_travel_mm", "shock_stroke_mm", "leverage", ...s.cogs.map(n => `antisquat_${s.chainring}x${n}`), "antirise", ...s.cogs.map(n => `kickback_deg_${s.chainring}x${n}`), "axle_x_mm", "axle_y_mm"];
  return [head.join(";"), ...res.poses.map(p => [p.travel, res.L0 - p.shock, p.leverage, ...p.antiSquat, p.antiRise, ...p.kickback, p.P[model.axle].x, p.P[model.axle].y].map(v => isFinite(v) ? v.toFixed(3) : "").join(";"))].join("\n");
}
const PROJECT = [{ name: "MTB kinematics project", extensions: ["mtbk", "json"] }];
let fileName = "new-project.mtbk";
function setFileName(n: string) { fileName = n; $("fileName").textContent = n; }
function applyModel(m: BikeModel) {
  model = m; view = null; poseIdx = 0; forkComp = forkSagMM(m);
  $("preset").value = m.preset && m.preset in LAYOUTS ? m.preset : "horst";
  buildFields(); buildPoints(); recompute(true); poseIdx = sagIdx; render();
}
$("btnOpen").addEventListener("click", async () => {
  try {
    const f = await openText(PROJECT); if (!f) return;
    const m = JSON.parse(f.text);
    if (m.version !== 2 || !m.points || !m.links || !m.setup) throw new Error("format");
    applyModel(m); setFileName(f.name);
  } catch (e) { showError("This file is not a valid project (version 2 .mtbk file expected)."); }
});
$("btnSave").addEventListener("click", async () => {
  try { const n = await saveText(fileName, JSON.stringify(model, null, 2), PROJECT); if (n) setFileName(n); }
  catch (e) { showError("Could not save: " + e); }
});
$("btnCsv").addEventListener("click", async () => {
  if (!res || res.error) return;
  try { await saveText(fileName.replace(/\.\w+$/, "") + "-curves.csv", csv(), [{ name: "CSV", extensions: ["csv"] }]); }
  catch (e) { showError("Could not export: " + e); }
});
$("btn3d").addEventListener("click", async () => {
  if (!res || res.error) return;
  const pose = res.poses[poseIdx];
  const base = fileName.replace(/\.\w+$/, "") + `-${pose.travel.toFixed(0)}mm`;
  try { await saveText(base + ".step", toStep(stepBodies(model, pose.P), base), [{ name: "STEP", extensions: ["step", "stp"] }]); }
  catch (e) { showError("Could not export 3D: " + e); }
});
function showError(msg: string) { const err = $("err"); err.hidden = false; err.textContent = msg; }

new ResizeObserver(() => { view = null; render(); }).observe(document.querySelector(".stage")!);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

buildCharts();
applyModel(load());
