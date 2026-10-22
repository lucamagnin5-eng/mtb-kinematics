// Efforts aux pivots (statique plane, sans frottement).
// Chaque corps est représenté par ses biellettes (treillis) : on résout l'effort dans chaque
// biellette et dans l'amortisseur pour équilibrer une charge verticale sur la roue arrière,
// puis l'effort dans un pivot est la somme des efforts des biellettes d'une pièce sur ce point.

import { solveLinear, type Pose } from "./kinematics";
import type { BikeModel, Vec } from "./types";

export interface PivotForce {
  id: string;
  label: string;
  /** Effort transmis par le pivot (N). */
  F: number;
  /** Effort exercé par les pièces mobiles sur le pivot (N, repère cadre). */
  v: Vec;
}

export interface ForceResult {
  pivots: PivotForce[];
  /** Effort dans l'amortisseur (N, positif en compression). */
  shock: number;
}

/**
 * up : direction de la charge dans le repère cadre (verticale du sol), load en N.
 * Renvoie null quand la tringlerie est à un point singulier.
 */
export function pivotForces(model: BikeModel, P: Pose, up: Vec, load: number): ForceResult | null {
  const moving = Object.keys(model.points).filter(id => !model.points[id].fixed);
  const row: Record<string, number> = {};
  moving.forEach((id, i) => (row[id] = 2 * i));
  const links = model.links;
  const n = links.length + 1, m = 2 * moving.length;
  if (m !== n) return null;
  const unit = (a: string, b: string): Vec => {
    const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, d = Math.hypot(dx, dy);
    return { x: dx / d, y: dy / d };
  };
  const A = Array.from({ length: m }, () => new Array<number>(n).fill(0));
  const rhs = new Array<number>(m).fill(0);
  // Effort de traction t dans chaque biellette : il tire chaque extrémité vers l'autre.
  const put = (id: string, col: number, u: Vec) => { if (id in row) { A[row[id]][col] += u.x; A[row[id] + 1][col] += u.y; } };
  links.forEach(([a, b], k) => { put(a, k, unit(a, b)); put(b, k, unit(b, a)); });
  const [sa, sb] = model.shock;
  put(sa, n - 1, unit(sa, sb)); put(sb, n - 1, unit(sb, sa));
  if (!(model.axle in row)) return null;
  rhs[row[model.axle]] -= load * up.x;
  rhs[row[model.axle] + 1] -= load * up.y;
  const t = solveLinear(A, rhs);
  if (!t) return null;

  // Pièces : corps déclarés + biellettes isolées qui n'appartiennent à aucun corps.
  const bodies = [...model.bodies];
  for (const [a, b] of links) if (!bodies.some(B => B.includes(a) && B.includes(b))) bodies.push([a, b]);
  const sumAt = (id: string, B: string[] | null): Vec => {
    const s = { x: 0, y: 0 };
    links.forEach(([a, b], k) => {
      if (a !== id && b !== id) return;
      const o = a === id ? b : a;
      if (B && !(B.includes(a) && B.includes(b))) return;
      const u = unit(id, o);
      s.x += t[k] * u.x; s.y += t[k] * u.y;
    });
    return s;
  };
  const pivots: PivotForce[] = [];
  for (const [id, p] of Object.entries(model.points)) {
    const owners = bodies.filter(B => B.includes(id));
    if (p.fixed) {
      if (!owners.length) continue;
      const v = sumAt(id, null);
      pivots.push({ id, label: p.label, F: Math.hypot(v.x, v.y), v });
    } else if (owners.length >= 2) {
      // Effort entre deux pièces : on garde la pièce la plus chargée (diffère seulement si une charge extérieure s'applique au point).
      const vs = owners.map(B => sumAt(id, B));
      const v = vs.reduce((a, b) => (Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) ? b : a));
      pivots.push({ id, label: p.label, F: Math.hypot(v.x, v.y), v });
    }
  }
  return { pivots, shock: -t[n - 1] };
}

/** Verticale du sol exprimée dans le repère cadre. */
export function groundUp(T: { inv: (p: Vec) => Vec }): Vec {
  const a = T.inv({ x: 0, y: 0 }), b = T.inv({ x: 0, y: 1 });
  return { x: b.x - a.x, y: b.y - a.y };
}
