import { describe, expect, it } from "vitest";
import { compile, geometry, sweep, type SweepResult } from "../src/core/kinematics";
import { PRESETS, makeModel } from "../src/core/presets";
import type { BikeModel, Vec } from "../src/core/types";

type Ok = Exclude<SweepResult, { error: string }>;
const ok = (r: SweepResult): Ok => {
  if (r.error) throw new Error(r.error);
  return r as Ok;
};

// Monopivot avec amortisseur directement sur le bras : solution analytique connue.
function directMountSinglePivot(): BikeModel {
  const m = makeModel("horst");
  const keep = ["BB", "HT", "HB", "ST", "SB"];
  m.points = Object.fromEntries(Object.entries(m.points).filter(([k]) => keep.includes(k)));
  m.points.MP = { x: -30, y: 90, fixed: true, label: "Pivot principal" };
  m.points.SF = { x: 150, y: 260, fixed: true, label: "Ancrage amortisseur" };
  m.points.A = { x: -437, y: 34, fixed: false, label: "Axe" };
  m.points.R = { x: -60, y: 210, fixed: false, label: "Œil amortisseur" };
  m.links = [["MP", "A"], ["MP", "R"], ["A", "R"]];
  m.bodies = [["MP", "A", "R"]];
  m.shock = ["SF", "R"];
  m.axleBody = ["MP", "A"];
  m.setup.shockStroke = 55;
  return m;
}

const rotAbout = (p: Vec, c: Vec, a: number): Vec => ({
  x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a),
  y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a),
});

describe("solveur", () => {
  it("chaque modèle d'exemple a exactement 1 degré de liberté et atteint la fin de course", () => {
    for (const key of Object.keys(PRESETS)) {
      const m = makeModel(key);
      expect(compile(m).dof).toBe(1);
      const r = ok(sweep(m));
      expect(r.complete).toBe(true);
      expect(r.L0 - r.poses.at(-1)!.shock).toBeCloseTo(m.setup.shockStroke, 6);
    }
  });

  it("conserve la longueur de chaque biellette sur tout le débattement", () => {
    const m = makeModel("dw");
    const r = ok(sweep(m));
    for (const p of r.poses)
      for (const l of r.C.links) expect(Math.hypot(p.P[l.a].x - p.P[l.b].x, p.P[l.a].y - p.P[l.b].y)).toBeCloseTo(l.L, 8);
  });

  it("donne le même rapport de levier que la solution analytique d'un monopivot", () => {
    const m = directMountSinglePivot();
    const r = ok(sweep(m, 0.25));
    const { MP, A, R, SF } = m.points;
    // Angle de bras pour une hauteur d'axe donnée, puis longueur d'amortisseur.
    const shockAt = (travel: number) => {
      const r0 = Math.hypot(A.x - MP.x, A.y - MP.y), a0 = Math.atan2(A.y - MP.y, A.x - MP.x);
      const a = Math.PI - Math.asin((A.y + travel - MP.y) / r0) - a0; // l'axe est derrière le pivot
      const Rt = rotAbout(R, MP, a);
      return Math.hypot(SF.x - Rt.x, SF.y - Rt.y);
    };
    for (const p of r.poses.filter((_, i) => i > 2 && i % 40 === 0)) {
      const h = 1e-3;
      const lr = (2 * h) / (shockAt(p.travel - h) - shockAt(p.travel + h));
      expect(p.shock).toBeCloseTo(shockAt(p.travel), 6);
      expect(p.leverage).toBeCloseTo(lr, 3);
    }
  });

  it("place le centre instantané d'un monopivot sur le pivot principal", () => {
    const m = directMountSinglePivot();
    const r = ok(sweep(m));
    for (const p of r.poses) {
      const mp = p.T.fwd(m.points.MP);
      expect(p.ic!.x).toBeCloseTo(mp.x, 9);
      expect(p.ic!.y).toBeCloseTo(mp.y, 9);
    }
  });

  it("trouve le CIR d'un Horst à l'intersection des deux biellettes", () => {
    const m = makeModel("horst");
    const r = ok(sweep(m, 0.1));
    const p = r.poses[300];
    // Droites base (MP–H) et biellette (RP–S) dans le repère sol.
    const f = (id: string) => p.T.fwd(p.P[id]);
    const [a, b, c, d] = [f("MP"), f("H"), f("RP"), f("S")];
    const cross = (u: Vec, v: Vec) => u.x * v.y - u.y * v.x;
    const d1 = { x: b.x - a.x, y: b.y - a.y }, d2 = { x: d.x - c.x, y: d.y - c.y };
    const s = cross({ x: c.x - a.x, y: c.y - a.y }, d2) / cross(d1, d2);
    const expected = { x: a.x + s * d1.x, y: a.y + s * d1.y };
    // Différences finies à 0,1 mm : tolérance de l'ordre du millimètre à plusieurs mètres de distance.
    expect(Math.hypot(p.ic!.x - expected.x, p.ic!.y - expected.y)).toBeLessThan(1);
  });

  it("signale un mécanisme mal contraint", () => {
    const m = makeModel("horst");
    m.links = m.links.slice(1);
    expect(sweep(m).error).toMatch(/degré/);
  });
});

describe("géométrie", () => {
  it("pose les deux roues au sol", () => {
    const m = makeModel("horst");
    const r = ok(sweep(m));
    for (const p of [r.poses[0], r.poses.at(-1)!]) {
      expect(p.T.fwd(p.P.A).y).toBeCloseTo(m.setup.rearR, 9);
      expect(p.T.fwd(r.F).y).toBeCloseTo(m.setup.frontR, 9);
    }
  });

  it("donne un angle de direction cohérent avec le tube de direction", () => {
    const m = makeModel("horst");
    const r = ok(sweep(m));
    const g = geometry(m, r.F, r.poses[0]);
    const { HT, HB } = m.points;
    const raw = 180 - (Math.atan2(HT.y - HB.y, HT.x - HB.x) * 180) / Math.PI;
    expect(g["Angle de direction"][0]).toBeCloseTo(raw - r.poses[0].T.pitch, 9);
  });
});
