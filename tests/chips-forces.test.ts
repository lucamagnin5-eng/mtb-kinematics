import { describe, expect, it } from "vitest";
import { chipCombos, effectiveModel, newChip } from "../src/core/chips";
import { exploreGeometry } from "../src/core/explore";
import { pivotForces } from "../src/core/forces";
import { dist, geometry, groundFor, sweep } from "../src/core/kinematics";
import { LAYOUTS, makeModel } from "../src/core/presets";
import type { BikeModel } from "../src/core/types";

const ok = (m: BikeModel) => {
  const r = sweep(m);
  if (r.error !== undefined) throw new Error(r.error);
  return r;
};
const staticGeo = (m: BikeModel) => {
  const r = ok(m), { F, T } = groundFor(m, r.poses[0].P, 0);
  return geometry(m, r.poses[0].P, T, F);
};

describe("flip chips", () => {
  it("ne change rien en position neutre", () => {
    const m = makeModel("horst");
    m.chips = [newChip(m, "chip")];
    expect(effectiveModel(m).model.points).toEqual(m.points);
  });

  it("garde les pièces et l'entraxe de l'amortisseur, et change la géométrie", () => {
    for (const key of Object.keys(LAYOUTS)) {
      const m = makeModel(key);
      m.chips = [{ ...newChip(m, "chip"), active: 1 }];
      const e = effectiveModel(m);
      expect(e.error).toBeUndefined();
      const [sa, sb] = m.shock;
      expect(dist(e.model.points[sa], e.model.points[sb])).toBeCloseTo(dist(m.points[sa], m.points[sb]), 6);
      // Point fixe déplacé : aucune biellette ne change de longueur.
      m.links.forEach(([a, b]) => expect(dist(e.model.points[a], e.model.points[b])).toBeCloseTo(dist(m.points[a], m.points[b]), 6));
      const g0 = staticGeo(m), g1 = staticGeo(e.model);
      expect(Math.abs(g1["Head angle"][0] - g0["Head angle"][0])).toBeGreaterThan(0.05);
    }
  });

  it("allonge la base avec une patte en position longue", () => {
    const m = makeModel("single-pivot");
    m.chips = [{ ...newChip(m, "dropout"), active: 1 }];
    const g0 = staticGeo(m), g1 = staticGeo(effectiveModel(m).model);
    expect(g1["Chainstay"][0] - g0["Chainstay"][0]).toBeGreaterThan(8);
  });

  it("remonte la suspension quand on change l'entraxe avec le cadre figé", () => {
    const m = makeModel("horst");
    m.locked = true;
    m.setup.shock.eye2eye -= 5;
    const e = effectiveModel(m);
    const [sa, sb] = m.shock;
    expect(dist(e.model.points[sa], e.model.points[sb])).toBeCloseTo(m.setup.shock.eye2eye, 6);
    // Amortisseur plus court : l'arrière est plus bas, le boîtier descend.
    expect(staticGeo(e.model)["BB height"][0]).toBeLessThan(staticGeo(m)["BB height"][0]);
  });

  it("énumère les combinaisons et la géométrie possible", () => {
    const m = makeModel("dw");
    m.chips = [newChip(m, "chip"), newChip(m, "dropout")];
    expect(chipCombos(m)).toHaveLength(4);
    const rows = exploreGeometry(m, "sag");
    expect(rows).toHaveLength(4 * 3); // Fox 36 : 3 débattements
    expect(rows.every(r => r.geo && !r.error)).toBe(true);
    // Plus de débattement de fourche : angle plus ouvert.
    const ha = (t: number) => rows.find(r => r.travel === t && r.chips.every(c => c === 0))!.geo!["Head angle"][0];
    expect(ha(170 - 10)).toBeLessThan(ha(140));
  });
});

describe("efforts aux pivots", () => {
  it("donne un effort d'amortisseur égal à la charge × ratio de levier", () => {
    for (const key of ["single-pivot", "horst", "dw", "vpp"]) {
      const m = makeModel(key);
      const r = ok(m);
      const i = Math.floor(r.poses.length / 3);
      const f = pivotForces(m, r.poses[i].P, { x: 0, y: 1 }, 1000)!;
      expect(f.shock / 1000).toBeCloseTo(r.poses[i].leverage, 1);
    }
  });

  it("équilibre le bras oscillant d'un mono-pivot", () => {
    const m = makeModel("single-pivot");
    const r = ok(m), P = r.poses[50].P;
    const f = pivotForces(m, P, { x: 0, y: 1 }, 1000)!;
    const mp = f.pivots.find(p => p.id === "MP")!;
    // Pivot + amortisseur + roue = 0 sur le bras.
    const [sa, sb] = m.shock, u = { x: P[sb].x - P[sa].x, y: P[sb].y - P[sa].y }, d = Math.hypot(u.x, u.y);
    const shockOnArm = { x: (f.shock * u.x) / d, y: (f.shock * u.y) / d };
    expect(-mp.v.x + shockOnArm.x).toBeCloseTo(0, 6);
    expect(-mp.v.y + shockOnArm.y + 1000).toBeCloseTo(0, 6);
  });

  it("donne un effort à chaque pivot entre deux pièces", () => {
    const m = makeModel("horst");
    const r = ok(m);
    const f = pivotForces(m, r.poses[0].P, { x: 0, y: 1 }, 1000)!;
    expect(f.pivots.map(p => p.id).sort()).toEqual(["H", "MP", "RP", "S"]);
    expect(f.pivots.every(p => isFinite(p.F) && p.F > 0)).toBe(true);
  });
});
