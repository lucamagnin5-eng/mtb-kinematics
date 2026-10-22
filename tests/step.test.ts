import { describe, expect, it } from "vitest";
import { sweep } from "../src/core/kinematics";
import { makeModel } from "../src/core/presets";
import { stepBodies, toStep } from "../src/core/step";

describe("export STEP", () => {
  const m = makeModel("horst");
  const r = sweep(m);
  if (r.error !== undefined) throw new Error(r.error);
  const pose = r.poses[0].P;
  const bodies = stepBodies(m, pose);

  it("exporte chaque pivot centré sur le plan médian, à sa position", () => {
    const mp = bodies.find(b => b.name.endsWith("[MP]"))!;
    expect(mp.base[0]).toBeCloseTo(m.points.MP.x, 9);
    expect(mp.base[1]).toBeCloseTo(m.points.MP.y, 9);
    expect(mp.base[2]).toBeCloseTo(-mp.length / 2, 9);
    const axle = bodies.find(b => b.name.endsWith("[A]"))!;
    expect(axle.length).toBe(148);
  });

  it("écrit un fichier AP214 complet avec un solide par corps", () => {
    const step = toStep(bodies, "test", new Date("2026-01-01T00:00:00Z"));
    expect(step.startsWith("ISO-10303-21;")).toBe(true);
    expect(step.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(step.match(/MANIFOLD_SOLID_BREP\(/g)!.length).toBe(bodies.length);
    expect(step).toContain("SI_UNIT(.MILLI.,.METRE.)");
    // Pas de caractère non ASCII brut dans le fichier.
    expect(/[^\x00-\x7f]/.test(step)).toBe(false);
  });
});
