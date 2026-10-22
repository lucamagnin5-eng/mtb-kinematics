// Flip chips et pattes réglables, cadre figé.
// Le modèle enregistré reste la base ; le modèle "effectif" applique les positions de puce
// actives puis remonte la suspension comme sur un vrai vélo : les pièces gardent leurs cotes,
// l'amortisseur reste à son entraxe détendu et la tringlerie trouve sa nouvelle position.

import { compile, dist, solveDriven } from "./kinematics";
import type { BikeModel, FlipChip, Vec } from "./types";

/** Corps (liste de points) qui porte la puce, ou null quand c'est le cadre. */
export function chipOwner(m: BikeModel, chip: FlipChip): string[] | null {
  if (m.points[chip.point]?.fixed) return null;
  const candidates = m.bodies.filter(b => b.includes(chip.point));
  return candidates[chip.body ?? 0] ?? candidates[0] ?? null;
}

/** Corps mobiles qui contiennent ce point (choix de la pièce qui porte la puce). */
export const bodiesWith = (m: BikeModel, id: string) => m.bodies.map((b, i) => ({ b, i })).filter(o => o.b.includes(id));

function activeOffsets(m: BikeModel): Record<string, Vec> {
  const off: Record<string, Vec> = {};
  for (const c of m.chips ?? []) {
    const p = c.positions[c.active];
    if (!p || !(c.point in m.points) || (p.dx === 0 && p.dy === 0)) continue;
    const o = (off[c.point] ??= { x: 0, y: 0 });
    o.x += p.dx; o.y += p.dy;
  }
  return off;
}

/** Vrai quand aucune puce ne déplace de point : le modèle effectif est la base. */
export const chipsNeutral = (m: BikeModel) => Object.keys(activeOffsets(m)).length === 0;

/** Entraxe que l'amortisseur doit avoir à l'état détendu. */
export function targetEyeToEye(m: BikeModel): number {
  const [sa, sb] = m.shock;
  return m.locked ? m.setup.shock.eye2eye : dist(m.points[sa], m.points[sb]);
}

export function effectiveModel(m: BikeModel): { model: BikeModel; error?: string } {
  const out: BikeModel = structuredClone(m);
  out.chips = [];
  const off = activeOffsets(m);
  const target = targetEyeToEye(m);
  const [sa, sb] = m.shock;
  if (Object.keys(off).length === 0 && Math.abs(dist(m.points[sa], m.points[sb]) - target) < 1e-9) return { model: out };

  for (const [id, o] of Object.entries(off)) { out.points[id].x += o.x; out.points[id].y += o.y; }
  // Une biellette change de longueur seulement si la puce est dans la pièce qui la porte.
  const owners = (m.chips ?? []).filter(c => off[c.point]).map(c => ({ id: c.point, body: chipOwner(m, c) }));
  const lengths = m.links.map(([a, b]) => {
    const changed = owners.some(o => o.body && (o.id === a || o.id === b) && o.body.includes(a) && o.body.includes(b));
    return dist(changed ? out.points[a] : m.points[a], changed ? out.points[b] : m.points[b]);
  });
  const C = compile(out, lengths);
  if (C.dof !== 1) return { model: out };
  const P = solveDriven(out, C, out.points, { shock: target });
  if (!P) return { model: out, error: "This flip chip / shock setting cannot be assembled: the linkage does not close." };
  for (const id of C.moving) { out.points[id].x = P[id].x; out.points[id].y = P[id].y; }
  return { model: out };
}

/** Toutes les combinaisons de positions des puces (produit cartésien). */
export function chipCombos(m: BikeModel): number[][] {
  let combos: number[][] = [[]];
  for (const c of m.chips ?? []) combos = combos.flatMap(k => c.positions.map((_, i) => [...k, i]));
  return combos;
}

export function newChip(m: BikeModel, kind: "chip" | "dropout"): FlipChip {
  if (kind === "dropout")
    return { name: "Dropout", point: m.axle, positions: [{ label: "Short", dx: 0, dy: 0 }, { label: "Long", dx: -10, dy: 0 }], active: 0 };
  return { name: "Flip chip", point: m.shock[0], positions: [{ label: "Low", dx: 0, dy: 0 }, { label: "High", dx: 0, dy: 6 }], active: 0 };
}
