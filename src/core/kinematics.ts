// Moteur cinématique plan générique.
// Chaque biellette est une contrainte de distance ; on pilote la hauteur de l'axe arrière
// et on résout la pose par Newton-Raphson à chaque pas de débattement.

import { wheelRadius } from "./catalog";
import type { BikeModel, Vec } from "./types";

export type Pose = Record<string, Vec>;

export interface Transform {
  fwd: (p: Vec) => Vec;
  inv: (p: Vec) => Vec;
  /** Assiette du cadre par rapport au sol (degrés). */
  pitch: number;
}

export interface ChainSegment { t1: Vec; t2: Vec }

export interface SweepPoint {
  P: Pose;
  travel: number;       // débattement vertical roue (mm)
  shock: number;        // longueur amortisseur (mm)
  leverage: number;
  ic: Vec | null;       // centre instantané de rotation (repère sol)
  T: Transform;
  rear: Vec;            // contact roue arrière
  front: Vec;           // contact roue avant
  antiRise: number;     // %
  antiSquat: number[];  // % par pignon
  kickback: number[];   // degrés par pignon
  chain: ChainSegment[][]; // brin tendu, par pignon (repère sol)
  ifc: (Vec | null)[];  // point de force instantané (dernier brin ∩ droite axe–CIR)
  axleX: number;        // déplacement horizontal de l'axe depuis l'état détendu (mm)
}

export interface Compiled {
  ids: string[];
  moving: string[];
  index: Record<string, number>;
  links: { a: string; b: string; L: number }[];
  nUnk: number;
  dof: number;
}

export type SweepResult =
  | { error: string; C: Compiled }
  | {
      error?: undefined;
      C: Compiled;
      poses: SweepPoint[];
      F: Vec;          // axe avant (repère cadre), fourche à la compression demandée
      forkComp: number;
      L0: number;      // longueur amortisseur détendu (géométrique)
      Lend: number;    // longueur en fin de course
      total: number;   // débattement total
      complete: boolean;
      r1: number;
      cogR: number[];
    };

export type GeometryRow = [value: number, unit: "°" | "mm"];

const CHAIN_PITCH = 12.7;
export const sprocketR = (n: number) => CHAIN_PITCH / (2 * Math.sin(Math.PI / n));
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Vec) => Math.hypot(v.x, v.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (r: number) => (r * 180) / Math.PI;

export const rearRadius = (m: BikeModel) => wheelRadius(m.setup.wheels.rear, m.setup.wheels.rearTire);
export const frontRadius = (m: BikeModel) => wheelRadius(m.setup.wheels.front, m.setup.wheels.frontTire);

/** Résolution d'un système linéaire carré (pivot partiel). null si singulier. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Inconnues = coordonnées des points mobiles ; longueurs figées à l'état détendu (ou imposées). */
export function compile(model: BikeModel, lengths?: number[]): Compiled {
  const ids = Object.keys(model.points);
  const moving = ids.filter(id => !model.points[id].fixed);
  const index: Record<string, number> = {};
  moving.forEach((id, i) => (index[id] = i));
  const links = model.links.map(([a, b], i) => ({ a, b, L: lengths?.[i] ?? dist(model.points[a], model.points[b]) }));
  const nUnk = moving.length * 2;
  return { ids, moving, index, links, nUnk, dof: nUnk - links.length };
}

export function solvePose(model: BikeModel, C: Compiled, guess: Record<string, Vec>, axleY: number): Pose | null {
  return solveDriven(model, C, guess, { axleY });
}

/** Pose pilotée soit par la hauteur de l'axe arrière, soit par la longueur de l'amortisseur. */
export function solveDriven(model: BikeModel, C: Compiled, guess: Record<string, Vec>, drv: { axleY: number } | { shock: number }): Pose | null {
  const P: Pose = {};
  for (const id of C.ids) P[id] = { ...(guess[id] ?? model.points[id]) };
  const ax = model.axle, [sa, sb] = model.shock;
  for (let it = 0; it < 40; it++) {
    const F: number[] = [];
    const J: number[][] = [];
    for (const { a, b, L } of C.links) {
      const dx = P[a].x - P[b].x, dy = P[a].y - P[b].y, d = Math.hypot(dx, dy);
      F.push(d - L);
      const row = new Array<number>(C.nUnk).fill(0);
      if (a in C.index) { row[2 * C.index[a]] += dx / d; row[2 * C.index[a] + 1] += dy / d; }
      if (b in C.index) { row[2 * C.index[b]] -= dx / d; row[2 * C.index[b] + 1] -= dy / d; }
      J.push(row);
    }
    const row = new Array<number>(C.nUnk).fill(0);
    if ("axleY" in drv) {
      F.push(P[ax].y - drv.axleY);
      row[2 * C.index[ax] + 1] = 1;
    } else {
      const dx = P[sa].x - P[sb].x, dy = P[sa].y - P[sb].y, d = Math.hypot(dx, dy);
      F.push(d - drv.shock);
      if (sa in C.index) { row[2 * C.index[sa]] += dx / d; row[2 * C.index[sa] + 1] += dy / d; }
      if (sb in C.index) { row[2 * C.index[sb]] -= dx / d; row[2 * C.index[sb] + 1] -= dy / d; }
    }
    J.push(row);
    if (Math.max(...F.map(Math.abs)) < 1e-10) return P;
    const step = solveLinear(J, F.map(v => -v));
    if (!step) return null;
    C.moving.forEach((id, i) => { P[id].x += step[2 * i]; P[id].y += step[2 * i + 1]; });
  }
  const ok = C.links.every(({ a, b, L }) => Math.abs(dist(P[a], P[b]) - L) < 1e-6);
  return ok ? P : null;
}

/** Centre instantané d'un corps connu par deux points et leurs vitesses. */
export function instantCenter(p: Vec, q: Vec, vp: Vec, vq: Vec): Vec | null {
  const n1 = { x: -vp.y, y: vp.x }, n2 = { x: -vq.y, y: vq.x };
  return lineIntersect(p, n1, q, n2);
}

export function lineIntersect(p1: Vec, d1: Vec, p2: Vec, d2: Vec): Vec | null {
  const det = d1.x * -d2.y - d1.y * -d2.x;
  if (Math.abs(det) < 1e-12) return null;
  const rx = p2.x - p1.x, ry = p2.y - p1.y;
  const s = (rx * -d2.y - ry * -d2.x) / det;
  return { x: p1.x + s * d1.x, y: p1.y + s * d1.y };
}

/**
 * Tangente extérieure entre deux pignons tournant dans le sens horaire (vus côté transmission),
 * parcourue du premier vers le second : la chaîne est à droite du sens de parcours.
 */
function tangent(c1: Vec, r1: number, c2: Vec, r2: number) {
  const d = sub(c2, c1), D = len(d), u = { x: d.x / D, y: d.y / D };
  const b = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / D)));
  const cand = [b, -b].map(a => ({ x: u.x * Math.cos(a) - u.y * Math.sin(a), y: u.x * Math.sin(a) + u.y * Math.cos(a) }));
  const n = cand.find(c => u.x * c.y - u.y * c.x < 0) ?? cand[0];
  return {
    t1: { x: c1.x + r1 * n.x, y: c1.y + r1 * n.y },
    t2: { x: c2.x + r2 * n.x, y: c2.y + r2 * n.y },
    psi: Math.atan2(n.y, n.x),
    span: Math.sqrt(Math.max(0, D * D - (r1 - r2) ** 2)),
  };
}

/**
 * Brin tendu plateau -> (poulie folle) -> pignon.
 * length : longueur entre deux points fixes des brins inférieurs, pour le calcul du kickback.
 */
export function chainPath(circles: { c: Vec; r: number }[]) {
  const segs = circles.slice(1).map((b, i) => tangent(circles[i].c, circles[i].r, b.c, b.r));
  let length = segs.reduce((s, t) => s + t.span, 0);
  length += circles[0].r * segs[0].psi - circles[circles.length - 1].r * segs[segs.length - 1].psi;
  for (let i = 1; i < circles.length - 1; i++) {
    let wrap = segs[i].psi - segs[i - 1].psi;
    while (wrap < 0) wrap += 2 * Math.PI;
    length += circles[i].r * wrap;
  }
  return { segs: segs.map(s => ({ t1: s.t1, t2: s.t2 })), length };
}

/** Passage repère cadre -> repère sol (les deux roues posées sur y = 0). */
export function groundTransform(A: Vec, F: Vec, Rr: number, Rf: number): Transform {
  const d = sub(F, A), D = len(d);
  const rho = Math.asin((Rf - Rr) / D) - Math.atan2(d.y, d.x);
  const c = Math.cos(rho), s = Math.sin(rho);
  const rot = (p: Vec) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const shift = Rr - rot(A).y;
  return {
    fwd: p => { const r = rot(p); return { x: r.x, y: r.y + shift }; },
    inv: p => { const y = p.y - shift; return { x: p.x * c + y * s, y: -p.x * s + y * c }; },
    pitch: deg(rho),
  };
}

/** Compression de fourche au sag (mm). */
export const forkSagMM = (m: BikeModel) => (m.setup.fork.travel * m.setup.fork.sag) / 100;

/** Axe avant (repère cadre) pour une compression de fourche donnée (mm). */
export function frontAxle(model: BikeModel, forkComp: number): Vec {
  const T = model.points[model.headTop], B = model.points[model.headBottom], f = model.setup.fork;
  const ax = sub(B, T), L = len(ax), u = { x: ax.x / L, y: ax.y / L };
  const perp = { x: -u.y, y: u.x };
  const pf = perp.x >= 0 ? perp : { x: -perp.x, y: -perp.y };
  const a2c = f.a2c - forkComp;
  return { x: B.x + u.x * a2c + pf.x * f.offset, y: B.y + u.y * a2c + pf.y * f.offset };
}

/** Repère sol pour une pose arrière et une compression de fourche. */
export function groundFor(model: BikeModel, P: Pose, forkComp: number) {
  const F = frontAxle(model, forkComp);
  return { F, T: groundTransform(P[model.axle], F, rearRadius(model), frontRadius(model)) };
}

/** Balayage du débattement complet, de l'état détendu à la fin de course amortisseur. */
export function sweep(model: BikeModel, opts: { step?: number; forkComp?: number } = {}): SweepResult {
  const step = opts.step ?? 0.5;
  const forkComp = opts.forkComp ?? forkSagMM(model);
  const C = compile(model);
  if (C.dof !== 1) return { error: `The linkage has ${C.dof} degree(s) of freedom instead of 1. Check the links.`, C };
  const g = model.setup, ax = model.axle, [sa, sb] = model.shock;
  const y0 = model.points[ax].y;
  const L0 = dist(model.points[sa], model.points[sb]);
  const Lend = L0 - g.shock.stroke;
  const raw: { P: Pose; travel: number; shock: number }[] = [];
  let guess: Record<string, Vec> = model.points, y = y0;
  for (let i = 0; i < 4000; i++) {
    const P = solvePose(model, C, guess, y);
    if (!P) break;
    const sl = dist(P[sa], P[sb]);
    raw.push({ P, travel: y - y0, shock: sl });
    if (sl <= Lend) break;
    guess = P;
    y += step;
  }
  if (raw.length < 3) return { error: "The linkage locks at the very start of the travel.", C };

  // Dernier point recalé par la méthode de la sécante pour finir exactement en fin de course.
  const complete = raw[raw.length - 1].shock <= Lend + 1e-9;
  if (complete && raw[raw.length - 1].shock < Lend) {
    let a = raw[raw.length - 2], b = raw[raw.length - 1];
    for (let it = 0; it < 8 && Math.abs(b.shock - Lend) > 1e-9; it++) {
      const t = b.travel + ((Lend - b.shock) * (b.travel - a.travel)) / (b.shock - a.shock);
      const P = solvePose(model, C, b.P, y0 + t);
      if (!P) break;
      [a, b] = [b, { P, travel: t, shock: dist(P[sa], P[sb]) }];
    }
    raw[raw.length - 1] = b;
  }

  const F = frontAxle(model, forkComp);
  const Rr = rearRadius(model), Rf = frontRadius(model);
  const r1 = sprocketR(g.chainring);
  const cogR = g.cogs.map(sprocketR);
  const ri = sprocketR(g.idlerTeeth);
  const [bp, bq] = model.axleBody;
  const BB = model.points.BB;
  const idler = model.idler ? model.points[model.idler] : null;
  const chainAt = (A: Vec, r2: number) =>
    chainPath(idler ? [{ c: BB, r: r1 }, { c: idler, r: ri }, { c: A, r: r2 }] : [{ c: BB, r: r1 }, { c: A, r: r2 }]);
  const len0 = cogR.map(r2 => chainAt(raw[0].P[ax], r2).length);

  const poses: SweepPoint[] = raw.map((o, i) => {
    const P = o.P;
    const i0 = Math.max(0, i - 1), i1 = Math.min(raw.length - 1, i + 1);
    const dT = raw[i1].travel - raw[i0].travel, dS = raw[i1].shock - raw[i0].shock;
    const vel = (id: string) => sub(raw[i1].P[id], raw[i0].P[id]);
    const ic = model.points[bp].fixed ? { ...P[bp] }
      : model.points[bq].fixed ? { ...P[bq] }
      : instantCenter(P[bp], P[bq], vel(bp), vel(bq));
    const T = groundTransform(P[ax], F, Rr, Rf);
    const Ag = T.fwd(P[ax]), Fg = T.fwd(F);
    const rear = { x: Ag.x, y: 0 }, front = { x: Fg.x, y: 0 };
    const icg = ic ? T.fwd(ic) : null;
    // Hauteur, à l'aplomb du contact avant, de la droite issue du contact arrière.
    const heightAtFront = (pt: Vec | null) => (pt ? ((pt.y - rear.y) / (pt.x - rear.x)) * (front.x - rear.x) : NaN);
    const chain: ChainSegment[][] = [], ifc: (Vec | null)[] = [], antiSquat: number[] = [], kickback: number[] = [];
    cogR.forEach((r2, k) => {
      const path = chainAt(P[ax], r2);
      const segs = path.segs.map(s => ({ t1: T.fwd(s.t1), t2: T.fwd(s.t2) }));
      // La force de chaîne sur l'arrière suit le dernier brin (poulie ou plateau -> pignon).
      const last = segs[segs.length - 1];
      const pt = icg ? lineIntersect(last.t1, sub(last.t2, last.t1), Ag, sub(icg, Ag)) : null;
      chain.push(segs);
      ifc.push(pt);
      antiSquat.push((heightAtFront(pt) / g.cogHeight) * 100);
      kickback.push(deg((path.length - len0[k]) / r1));
    });
    return {
      P, travel: o.travel, shock: o.shock,
      leverage: dS !== 0 ? -dT / dS : NaN,
      ic: icg, T, rear, front,
      antiRise: (heightAtFront(icg) / g.cogHeight) * 100,
      antiSquat, kickback, chain, ifc,
      axleX: P[ax].x - raw[0].P[ax].x,
    };
  });
  if (poses.length > 3) {
    poses[0].leverage = poses[1].leverage;
    poses[poses.length - 1].leverage = poses[poses.length - 2].leverage;
  }
  return { C, poses, F, forkComp, L0, Lend, total: poses[poses.length - 1].travel, complete, r1, cogR };
}

/** Cotes de géométrie mesurées au sol. */
export function geometry(model: BikeModel, P: Pose, T: Transform, F: Vec): Record<string, GeometryRow> {
  const g = model.setup;
  const bb = T.fwd(P.BB), ht = T.fwd(P[model.headTop]), hb = T.fwd(P[model.headBottom]);
  const A = T.fwd(P[model.axle]), Fg = T.fwd(F);
  const sb = T.fwd(P[model.seatBottom]), st = T.fwd(P[model.seatTop]);
  const hta = 180 - deg(Math.atan2(ht.y - hb.y, ht.x - hb.x));
  const sta = 180 - deg(Math.atan2(st.y - sb.y, st.x - sb.x));
  // Point de selle : sur l'axe de tige de selle, à "hauteur de selle" du boîtier.
  const d = sub(st, sb), dl = len(d), u = { x: d.x / dl, y: d.y / dl };
  const w = sub(sb, bb), bq = w.x * u.x + w.y * u.y, cq = w.x * w.x + w.y * w.y - g.saddleHeight ** 2;
  const s = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
  const saddle = { x: sb.x + u.x * s, y: sb.y + u.y * s };
  const esta = 180 - deg(Math.atan2(saddle.y - bb.y, saddle.x - bb.x));
  const axisGround = lineIntersect(hb, sub(ht, hb), { x: 0, y: 0 }, { x: 1, y: 0 });
  return {
    "Head angle": [hta, "°"],
    "Seat angle (actual)": [sta, "°"],
    "Seat angle (effective)": [esta, "°"],
    "Reach": [ht.x - bb.x, "mm"],
    "Stack": [ht.y - bb.y, "mm"],
    "BB height": [bb.y, "mm"],
    "BB drop": [A.y - bb.y, "mm"],
    "Chainstay": [dist(A, bb), "mm"],
    "Chainstay (horizontal)": [bb.x - A.x, "mm"],
    "Front center": [Fg.x - bb.x, "mm"],
    "Wheelbase": [Fg.x - A.x, "mm"],
    "Trail": [axisGround ? axisGround.x - Fg.x : NaN, "mm"],
    "Frame pitch": [T.pitch, "°"],
  };
}
