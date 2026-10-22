// Explorateur de géométrie : cadre figé, on passe en revue toutes les positions de flip chips
// et tous les débattements de la fourche choisie.

import { FORKS, forkA2C } from "./catalog";
import { chipCombos, effectiveModel } from "./chips";
import { forkSagMM, geometry, groundFor, sweep, type GeometryRow } from "./kinematics";
import type { BikeModel } from "./types";

export interface ExploreRow {
  chips: number[];
  travel: number;
  a2c: number;
  rearTravel: number;
  geo: Record<string, GeometryRow> | null;
  error?: string;
}

export const MAX_COMBOS = 64;

export function exploreGeometry(base: BikeModel, at: "static" | "sag"): ExploreRow[] {
  const fk = base.setup.fork;
  const travels = fk.model in FORKS ? FORKS[fk.model].travels : [fk.travel];
  const rows: ExploreRow[] = [];
  for (const combo of chipCombos(base)) for (const travel of travels) {
    if (rows.length >= MAX_COMBOS) return rows;
    const m: BikeModel = structuredClone(base);
    combo.forEach((k, i) => (m.chips![i].active = k));
    m.setup.fork.travel = travel;
    if (fk.model in FORKS) m.setup.fork.a2c = forkA2C(fk.model, m.setup.wheels.front, travel);
    const row: ExploreRow = { chips: combo, travel, a2c: m.setup.fork.a2c, rearTravel: NaN, geo: null };
    rows.push(row);
    const e = effectiveModel(m);
    if (e.error) { row.error = e.error; continue; }
    const r = sweep(e.model, { step: 1 });
    if (r.error !== undefined) { row.error = r.error; continue; }
    row.rearTravel = r.total;
    let i = 0;
    if (at === "sag") {
      const target = (m.setup.sag / 100) * m.setup.shock.stroke;
      i = r.poses.findIndex(p => r.L0 - p.shock >= target);
      if (i < 0) i = r.poses.length - 1;
    }
    const P = r.poses[i].P, fc = at === "sag" ? forkSagMM(m) : 0;
    const { F, T } = groundFor(e.model, P, fc);
    row.geo = geometry(e.model, P, T, F);
  }
  return rows;
}
