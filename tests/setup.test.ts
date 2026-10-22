import { describe, expect, it } from "vitest";
import { SHOCKS, forkA2C, wheelRadius } from "../src/core/catalog";
import { fitShock, readFrame, setIdler, writeFrame } from "../src/core/frame";
import { chainPath, geometry, groundFor, sprocketR, sweep } from "../src/core/kinematics";
import { makeModel } from "../src/core/presets";

describe("catalogue", () => {
  it("donne des rayons de roue et des axe-té cohérents", () => {
    expect(wheelRadius("29", 2.4)).toBeCloseTo(311 + 2.4 * 25.4 * 0.95, 9);
    expect(wheelRadius("27.5", 2.4)).toBeLessThan(wheelRadius("29", 2.4));
    expect(forkA2C("fox36", "29", 160)).toBe(571);
    expect(forkA2C("fox36", "27.5", 160)).toBe(557);
    expect(forkA2C("fox40", "29", 203)).toBe(583);
  });
});

describe("cotes du cadre", () => {
  it("relit exactement ce qui a été écrit", () => {
    const m = makeModel("horst");
    const cases: [keyof ReturnType<typeof readFrame>, number][] = [
      ["reach", 492], ["stack", 641], ["headAngle", 63.2], ["headTube", 120], ["seatAngle", 77.5], ["seatTube", 455], ["chainstay", 445], ["bbDrop", 25],
    ];
    for (const [k, v] of cases) {
      writeFrame(m, k, v);
      expect(readFrame(m)[k]).toBeCloseTo(v, 9);
    }
    // Les autres cotes n'ont pas bougé.
    const f = readFrame(m);
    for (const [k, v] of cases) expect(f[k]).toBeCloseTo(v, 9);
  });

  it("donne l'angle de direction de conception quand le cadre est à plat", () => {
    const m = makeModel("horst");
    const r = sweep(m);
    if (r.error !== undefined) throw new Error(r.error);
    const { F, T } = groundFor(m, r.poses[0].P, 0);
    const g = geometry(m, r.poses[0].P, T, F);
    expect(g["Head angle"][0]).toBeCloseTo(readFrame(m).headAngle - T.pitch, 9);
  });
});

describe("amortisseur", () => {
  it("cale l'entraxe détendu sur la taille du catalogue", () => {
    const m = makeModel("dw");
    for (const [e, s] of SHOCKS.trunnion.sizes.slice(8, 12)) {
      fitShock(m, "trunnion", e, s);
      const [a, b] = m.shock;
      expect(Math.hypot(m.points[a].x - m.points[b].x, m.points[a].y - m.points[b].y)).toBeCloseTo(e, 9);
    }
  });
});

describe("fourche", () => {
  it("redresse l'angle de direction quand la fourche s'enfonce", () => {
    const m = makeModel("horst");
    const r = sweep(m);
    if (r.error !== undefined) throw new Error(r.error);
    const P = r.poses[0].P;
    const angle = (fc: number) => { const { F, T } = groundFor(m, P, fc); return geometry(m, P, T, F)["Head angle"][0]; };
    expect(angle(50)).toBeGreaterThan(angle(0));
    expect(angle(100)).toBeGreaterThan(angle(50));
  });
});

describe("poulie folle", () => {
  it("ne change rien quand elle est posée sur le brin tendu sans le dévier", () => {
    const BB = { x: 0, y: 0 }, A = { x: -440, y: 30 }, r1 = sprocketR(32), r2 = sprocketR(30);
    const direct = chainPath([{ c: BB, r: r1 }, { c: A, r: r2 }]);
    // Poulie minuscule placée sous le brin, tangente à celui-ci.
    const s = direct.segs[0], mid = { x: (s.t1.x + s.t2.x) / 2, y: (s.t1.y + s.t2.y) / 2 };
    const d = { x: s.t2.x - s.t1.x, y: s.t2.y - s.t1.y }, L = Math.hypot(d.x, d.y);
    const ri = 1e-6, n = { x: d.y / L, y: -d.x / L }; // côté droit du sens de parcours = vers le bas
    const withIdler = chainPath([{ c: BB, r: r1 }, { c: { x: mid.x + n.x * ri, y: mid.y + n.y * ri }, r: ri }, { c: A, r: r2 }]);
    expect(withIdler.length).toBeCloseTo(direct.length, 4);
  });

  it("réduit le kickback d'un pivot haut", () => {
    const m = makeModel("high-single-pivot");
    const withI = sweep(m);
    setIdler(m, false);
    const without = sweep(m);
    if (withI.error !== undefined || without.error !== undefined) throw new Error("sweep");
    expect(Math.abs(withI.poses.at(-1)!.kickback[1])).toBeLessThan(Math.abs(without.poses.at(-1)!.kickback[1]));
  });
});
