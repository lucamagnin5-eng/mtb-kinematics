// Règle les points de suspension des modèles d'exemple (recherche aléatoire locale) :
// débattement visé, rapport de levier progressif, anti-squat plausible au sag.
// Usage : npx tsx scripts/tune-presets.ts [layout...]  -> affiche les nouveaux points en JSON.

import { fitShock } from "../src/core/frame";
import { sweep } from "../src/core/kinematics";
import { LAYOUTS, makeModel } from "../src/core/presets";
import type { BikeModel } from "../src/core/types";

function score(m: BikeModel, target: number, init: BikeModel, vars: string[]): number {
  const [mount, e2e, stroke] = [m.setup.shock.mount, m.setup.shock.eye2eye, m.setup.shock.stroke];
  fitShock(m, mount, e2e, stroke);
  for (const p of vars.map(v => m.points[v])) if (p.x < -470 || p.x > 320 || p.y < -30 || p.y > 640) return 1e9;
  for (const [a, b] of m.links) if (Math.hypot(m.points[a].x - m.points[b].x, m.points[a].y - m.points[b].y) < 25) return 1e9;
  const r = sweep(m, { step: 1 });
  if (r.error !== undefined) return 1e9;
  if (!r.complete) return 1e8 - r.poses.length;
  const ps = r.poses, n = ps.length, avg = r.total / stroke;
  let s = Math.abs(r.total - target) * 6;
  s += Math.abs(ps[1].leverage - avg * 1.12) * 60 + Math.abs(ps[n - 2].leverage - avg * 0.9) * 60;
  for (let i = 2; i < n - 2; i++) {
    if (!(ps[i].leverage > 0)) s += 200;
    if (ps[i].leverage > ps[i - 1].leverage + 0.003) s += 4;
  }
  const sag = ps[Math.round(0.3 * (n - 1))];
  const idler = m.idler !== null;
  s += Math.abs(sag.antiSquat[1] - (idler ? 100 : 112)) * 0.4;
  if (idler) s += Math.max(0, Math.abs(ps[n - 1].kickback[1]) - 8) * 2;
  // Avec poulie, l'anti-squat dépend fortement du pignon : on le garde plausible sur les trois.
  // La poulie reste près du pivot principal, comme sur les cadres réels.
  if (idler && m.points.MP) s += Math.max(0, Math.hypot(m.points.I.x - m.points.MP.x, m.points.I.y - m.points.MP.y) - 55) * 5;
  if (idler) for (const v of sag.antiSquat) s += Math.max(0, Math.abs(v - 100) - 25) * 0.5;
  for (const [id, p] of Object.entries(m.points)) {
    const q = init.points[id];
    s += 0.0004 * ((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
  }
  return s;
}

// Points laissés à leur place réaliste (le réglage les déplacerait hors du cadre).
const FROZEN: Record<string, string[]> = { "single-pivot": ["MP"], "high-single-pivot": ["MP"], "high-horst": ["MP"] };

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LAYOUTS);
const out: Record<string, Record<string, { x: number; y: number }>> = {};
for (const key of keys) {
  const L = LAYOUTS[key];
  const init = makeModel(key);
  const vars = [...Object.keys(L.points), ...(L.idler ? ["I"] : [])].filter(v => !FROZEN[key]?.includes(v));
  let best = structuredClone(init), bestS = score(structuredClone(init), L.travelTarget, init, vars);
  for (let it = 0; it < 12000; it++) {
    const c = structuredClone(best);
    const sc = it < 4000 ? 20 : it < 8000 ? 6 : 1.5;
    for (const v of vars) if (Math.random() < 0.4) { c.points[v].x += (Math.random() - 0.5) * sc; c.points[v].y += (Math.random() - 0.5) * sc; }
    const s = score(c, L.travelTarget, init, vars);
    if (s < bestS) { bestS = s; best = c; }
  }
  fitShock(best, best.setup.shock.mount, best.setup.shock.eye2eye, best.setup.shock.stroke);
  out[key] = Object.fromEntries(vars.map(v => [v, { x: Math.round(best.points[v].x * 10) / 10, y: Math.round(best.points[v].y * 10) / 10 }]));
  const r = sweep(best);
  if (r.error === undefined) {
    const ps = r.poses, sag = ps[Math.round(0.3 * (ps.length - 1))];
    console.error(`${key}: score ${bestS.toFixed(1)} travel ${r.total.toFixed(1)} LR ${ps[1].leverage.toFixed(2)}→${ps[ps.length - 2].leverage.toFixed(2)} AS@sag ${sag.antiSquat.map(v => v.toFixed(0)).join("/")} AR@sag ${sag.antiRise.toFixed(0)} KB end ${ps[ps.length - 1].kickback.map(v => v.toFixed(1)).join("/")}`);
  } else console.error(`${key}: ${r.error}`);
}
console.log(JSON.stringify(out));
