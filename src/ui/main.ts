// Interface de l'atelier : vue vélo éditable, courbes et tableau de géométrie.
// La couche d'affichage reste volontairement peu typée ; le calcul vit dans src/core.

import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { sweep, geometry } from "../core/kinematics";
import { PRESETS, makeModel } from "../core/presets";
import type { BikeModel } from "../core/types";
import { openText, saveText } from "./io";
import { stepBodies, toStep } from "../core/step";


// ---------- État ----------
const $ = (id: string) => document.getElementById(id) as any;
let model: BikeModel, res: any, poseIdx = 0, sagIdx = 0, drag: any = null, hoverPt: string | null = null;
const show = { ic: true, as: true, ar: true, path: true, chain: true, labels: false };
const STORE = "mtb-kin-model-v1";

function load() {
  try { const s = localStorage.getItem(STORE); if (s) { const m = JSON.parse(s); if (m && m.points && m.links) return m; } } catch (e) {}
  return makeModel("horst");
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(model)); } catch (e) {} }

// ---------- Champs ----------
const FIELDS = {
  "f-shock": [["shockStroke", "Course amortisseur (mm)"], ["sag", "Sag (% course)"], ["cogHeight", "Hauteur CdG (mm)"]],
  "f-drive": [["chainring", "Plateau (dents)"], ["cog0", "Pignon 1 (dents)"], ["cog1", "Pignon 2 (dents)"], ["cog2", "Pignon 3 (dents)"], ["rearR", "Rayon roue AR (mm)"], ["frontR", "Rayon roue AV (mm)"]],
  "f-front": [["forkA2C", "Fourche axe-té (mm)"], ["forkOffset", "Déport (mm)"], ["forkTravel", "Débattement fourche"], ["forkSag", "Sag fourche (%)"], ["saddleHeight", "Hauteur de selle (mm)"]],
};
function getField(k) { return k.startsWith("cog") && k !== "cogHeight" ? model.setup.cogs[+k[3]] : model.setup[k]; }
function setField(k, v) { if (k.startsWith("cog") && k !== "cogHeight") model.setup.cogs[+k[3]] = v; else model.setup[k] = v; }
function buildFields() {
  for (const [box, list] of Object.entries(FIELDS)) {
    $(box).innerHTML = list.map(([k, l]) => `<label>${l}<input id="in-${k}" type="number" step="any" value="${getField(k)}"></label>`).join("");
    for (const [k] of list) $("in-" + k).addEventListener("change", e => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v) || v <= 0 && k !== "forkSag") { e.target.value = getField(k); return; }
      setField(k, v); recompute(true);
    });
  }
}
function buildPoints() {
  $("pts").innerHTML = Object.entries(model.points).map(([id, p]) =>
    `<tr data-id="${id}"><td><span class="k ${p.fixed ? "fix" : "mov"}"></span>${p.label}</td>
     <td><input id="px-${id}" type="number" step="0.1" value="${p.x.toFixed(1)}" aria-label="${p.label} x"></td>
     <td><input id="py-${id}" type="number" step="0.1" value="${p.y.toFixed(1)}" aria-label="${p.label} y"></td></tr>`).join("");
  for (const id of Object.keys(model.points)) for (const a of ["x", "y"]) {
    $(`p${a}-${id}`).addEventListener("change", e => {
      const v = parseFloat(e.target.value); if (!isFinite(v)) return;
      model.points[id][a] = v; recompute(true);
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
  const r = sweep(model);
  if (!r.error || !res || res.error) res = r; // garde la dernière pose valide à l'écran
  const err = $("err");
  if (r.error) { err.hidden = false; err.textContent = r.error; }
  else if (!res.complete) { err.hidden = false; err.textContent = `Le mécanisme se bloque après ${res.total.toFixed(1)} mm : la course complète de l'amortisseur n'est pas atteinte.`; }
  else err.hidden = true;
  if (!res.error) {
    const target = model.setup.sag / 100 * model.setup.shockStroke;
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
  const g = model.setup, A = P(model.axle), F = T.fwd(res.F);
  // Cadrage fixe calculé à l'état détendu pour éviter que la vue saute.
  if (!view || !drag) {
    const p0 = res.poses[0], T0 = p0.T;
    const xs = [T0.fwd(p0.P[model.axle]).x - g.rearR, T0.fwd(res.F).x + g.frontR];
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
  ctx.fillStyle = C.muted; ctx.font = `11px ${C.mono}`; ctx.fillText("CdG", ...S({ x: pose.front.x - 136, y: g.cogHeight + 14 }));
  ctx.strokeStyle = C.grid; line(pose.front, { x: pose.front.x, y: g.cogHeight + 60 });

  // Roues
  ctx.strokeStyle = C.tire; ctx.lineWidth = Math.max(3, 55 * view.s);
  ctx.globalAlpha = .18; circle(A, g.rearR - 28); circle(F, g.frontR - 28); ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5; circle(A, g.rearR); circle(F, g.frontR);
  ctx.strokeStyle = C.rim; ctx.lineWidth = 1; circle(A, g.rearR - 60); circle(F, g.frontR - 60);

  // Transmission
  if (show.chain && res.r1) {
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    circle(P("BB"), res.r1); circle(A, res.cogR[1]);
    ctx.strokeStyle = C.s[1]; ctx.lineWidth = 2; line(pose.chain[1].t1, pose.chain[1].t2);
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
    ctx.fillStyle = C.ic; ctx.font = `600 11px ${C.mono}`; ctx.fillText("CIR", x + 10, y - 10);
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
  { id: "lr", title: "Rapport de levier", unit: "", dec: 2, series: () => [{ name: "Levier", get: p => p.leverage }] },
  { id: "as", title: "Anti-squat", unit: "%", dec: 0, series: () => model.setup.cogs.map((n, k) => ({ name: `${model.setup.chainring}×${n}`, get: p => p.antiSquat[k] })), ref: 100 },
  { id: "ar", title: "Anti-rise", unit: "%", dec: 0, series: () => [{ name: "Anti-rise", get: p => p.antiRise }], ref: 100, color: 2 },
  { id: "kb", title: "Pedal kickback", unit: "°", dec: 1, series: () => model.setup.cogs.map((n, k) => ({ name: `${model.setup.chainring}×${n}`, get: p => p.kickback[k] })) },
  { id: "ap", title: "Trajectoire d'axe (recul)", unit: "mm", dec: 1, series: () => [{ name: "Δx axe", get: p => -p.axleX }] },
  { id: "sh", title: "Course amortisseur utilisée", unit: "mm", dec: 1, series: () => [{ name: "Compression", get: p => res.L0 - p.shock }] },
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
  const g0 = geometry(model, res.F, res.poses[0]), gs = geometry(model, res.F, res.poses[sagIdx]), gc = geometry(model, res.F, res.poses[poseIdx]);
  const rows = Object.keys(g0).filter(k => k[0] !== "_");
  const dec = u => (u === "°" ? 1 : 1);
  $("geo").innerHTML = `<tr><th>Cote</th><th>Détendu</th><th>Sag ${model.setup.sag}%</th><th>Actuel</th></tr>` +
    rows.map(k => `<tr><td>${k}</td><td>${fmt(g0[k][0], dec(g0[k][1]))}${g0[k][1] === "°" ? "°" : ""}</td><td>${fmt(gs[k][0], 1)}${gs[k][1] === "°" ? "°" : ""}</td><td>${fmt(gc[k][0], 1)}${gc[k][1] === "°" ? "°" : ""}</td></tr>`).join("");
}
function renderReadout() {
  if (!res || res.error) { $("read").innerHTML = ""; return; }
  const p = res.poses[poseIdx], comp = res.L0 - p.shock;
  $("travel").max = res.poses.length - 1; $("travel").value = poseIdx;
  const k = 1;
  $("read").innerHTML = [
    ["Roue", `${p.travel.toFixed(1)} / ${res.total.toFixed(1)} mm`],
    ["Amortisseur", `${comp.toFixed(1)} mm (${(comp / model.setup.shockStroke * 100).toFixed(0)} %)`],
    ["Levier", fmt(p.leverage, 2)],
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
  const r = sweep(model);
  if (!r.error) { res = r; drag.pose = (r as any).poses[0]; }
  else drag.pose = { ...drag.pose, P: { ...drag.pose.P, [drag.id]: { ...model.points[drag.id] } } };
  $("err").hidden = !r.error; if (r.error) $("err").textContent = r.error;
  syncPointInputs(); drawBike();
});
const endDrag = () => { if (!drag) return; drag = null; recompute(true); };
$("bike").addEventListener("pointerup", endDrag); $("bike").addEventListener("pointercancel", endDrag);
function markRow(id) { document.querySelectorAll("#pts tr").forEach(tr => tr.classList.toggle("hl", (tr as HTMLElement).dataset.id === id)); }

// ---------- Interface ----------
$("travel").addEventListener("input", e => { poseIdx = +e.target.value; render(); });
$("preset").innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("");
$("preset").addEventListener("change", e => { model = makeModel(e.target.value); poseIdx = 0; view = null; buildFields(); buildPoints(); recompute(true); });
$("btnReset").addEventListener("click", () => { model = makeModel($("preset").value); poseIdx = 0; view = null; buildFields(); buildPoints(); recompute(true); });
const TG = [["ic", "Centre instantané"], ["as", "Ligne anti-squat"], ["ar", "Ligne anti-rise"], ["path", "Trajectoire d'axe"], ["chain", "Chaîne"], ["labels", "Noms des points"]];
$("toggles").innerHTML = TG.map(([k, l]) => `<label><input type="checkbox" id="tg-${k}" ${show[k] ? "checked" : ""}>${l}</label>`).join("");
TG.forEach(([k]) => $("tg-" + k).addEventListener("change", e => { show[k] = e.target.checked; drawBike(); }));

function csv() {
  const s = model.setup, head = ["roue_mm", "amorti_mm", "levier", ...s.cogs.map(n => `AS_${s.chainring}x${n}`), "AR", ...s.cogs.map(n => `kickback_${s.chainring}x${n}`), "axe_x_mm", "axe_y_mm"];
  return [head.join(";"), ...res.poses.map(p => [p.travel, res.L0 - p.shock, p.leverage, ...p.antiSquat, p.antiRise, ...p.kickback, p.P[model.axle].x, p.P[model.axle].y].map(v => isFinite(v) ? v.toFixed(3) : "").join(";"))].join("\n");
}
const PROJECT = [{ name: "Projet cinématique", extensions: ["mtbk", "json"] }];
let fileName = "nouveau-projet.mtbk";
function setFileName(n: string) { fileName = n; $("fileName").textContent = n; }
function applyModel(m: BikeModel) {
  model = m; view = null; poseIdx = 0;
  $("preset").value = m.preset && m.preset in PRESETS ? m.preset : "horst";
  buildFields(); buildPoints(); recompute(true); poseIdx = sagIdx; render();
}
$("btnOpen").addEventListener("click", async () => {
  try {
    const f = await openText(PROJECT); if (!f) return;
    const m = JSON.parse(f.text);
    if (!m.points || !m.links || !m.setup) throw new Error("format");
    applyModel(m); setFileName(f.name);
  } catch (e) { showError("Ce fichier n'est pas un projet valide : il doit contenir points, links et setup."); }
});
$("btnSave").addEventListener("click", async () => {
  try { const n = await saveText(fileName, JSON.stringify(model, null, 2), PROJECT); if (n) setFileName(n); }
  catch (e) { showError("Enregistrement impossible : " + e); }
});
$("btnCsv").addEventListener("click", async () => {
  if (!res || res.error) return;
  try { await saveText(fileName.replace(/\.\w+$/, "") + "-courbes.csv", csv(), [{ name: "CSV", extensions: ["csv"] }]); }
  catch (e) { showError("Export impossible : " + e); }
});
$("btn3d").addEventListener("click", async () => {
  if (!res || res.error) return;
  const pose = res.poses[poseIdx];
  const base = fileName.replace(/\.\w+$/, "") + `-${pose.travel.toFixed(0)}mm`;
  try { await saveText(base + ".step", toStep(stepBodies(model, pose.P), base), [{ name: "STEP", extensions: ["step", "stp"] }]); }
  catch (e) { showError("Export 3D impossible : " + e); }
});
function showError(msg: string) { const err = $("err"); err.hidden = false; err.textContent = msg; }

new ResizeObserver(() => { view = null; render(); }).observe(document.querySelector(".stage")!);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

model = load();
$("preset").value = model.preset && model.preset in PRESETS ? model.preset : "horst";
buildFields(); buildPoints(); buildCharts(); recompute(false);
poseIdx = sagIdx; render();
