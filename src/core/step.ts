// Export STEP (ISO 10303-21, AP214) des pivots, interfaces et biellettes d'une pose.
// Chaque élément est un corps cylindrique nommé ; x vers l'avant, y vers le haut,
// z latéral (plan médian du vélo en z = 0), en mm, origine au boîtier.

import type { BikeModel, Vec } from "./types";

type V3 = [number, number, number];

export interface StepBody {
  name: string;
  /** Centre de la base, axe (unitaire) et longueur. */
  base: V3;
  axis: V3;
  length: number;
  radius: number;
}

/** Diamètre / largeur par défaut d'une interface selon le rôle du point. */
function interfaceSize(model: BikeModel, id: string): { d: number; w: number } {
  const p = model.points[id];
  let def = { d: 15, w: 60 };                          // pivot de suspension
  if (id === model.axle) def = { d: 12, w: 148 };      // axe traversant Boost
  else if (id === model.shock[0] && model.setup.shock.mount === "trunnion") def = { d: 10, w: 46 }; // trunnion (corps)
  else if (model.shock.includes(id)) def = { d: 8, w: 22 }; // œil d'amortisseur
  else if (id === "BB") def = { d: 41, w: 73 };        // boîtier
  return { d: p.d ?? def.d, w: p.w ?? def.w };
}

const unit = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

/** Corps exportés pour une pose (positions dans le repère cadre). */
export function stepBodies(model: BikeModel, pose: Record<string, Vec>): StepBody[] {
  const bodies: StepBody[] = [];
  const P = (id: string) => pose[id] ?? model.points[id];
  const frameOnly = new Set([model.headTop, model.headBottom, model.seatTop, model.seatBottom]);
  for (const [id, pt] of Object.entries(model.points)) {
    if (frameOnly.has(id)) continue;
    const { d, w } = interfaceSize(model, id);
    const q = P(id);
    bodies.push({ name: `${pt.label} [${id}]`, base: [q.x, q.y, -w / 2], axis: [0, 0, 1], length: w, radius: d / 2 });
  }
  // Tube de direction et tube de selle : interfaces du cadre.
  const tube = (name: string, a: Vec, b: Vec, d: number) => {
    const ax = unit([b.x - a.x, b.y - a.y, 0]);
    bodies.push({ name, base: [a.x, a.y, 0], axis: ax, length: Math.hypot(b.x - a.x, b.y - a.y), radius: d / 2 });
  };
  tube("Tube de direction", P(model.headBottom), P(model.headTop), model.points[model.headTop].d ?? 50);
  tube("Tube de selle", P(model.seatBottom), P(model.seatTop), model.points[model.seatTop].d ?? 34.9);
  // Squelette : biellettes et amortisseur, entre centres de pivots, dans le plan médian.
  for (const [a, b] of model.links) tube(`Biellette ${a}-${b}`, P(a), P(b), 4);
  tube(`Amortisseur ${model.shock[0]}-${model.shock[1]}`, P(model.shock[0]), P(model.shock[1]), 6);
  return bodies;
}

/** Fichier STEP complet. */
export function toStep(bodies: StepBody[], name = "mtb-kinematics", date = new Date()): string {
  const lines: string[] = [];
  let n = 0;
  const add = (s: string) => { n += 1; lines.push(`#${n}=${s};`); return `#${n}`; };
  const r = (v: number) => { const s = (Math.abs(v) < 1e-12 ? 0 : v).toPrecision(15); return s.includes(".") || s.includes("E") || s.includes("e") ? s.replace("e", "E") : s + "."; };
  const str = (s: string) => `'${s.replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => enc(c))}'`;
  const pt = (v: V3) => add(`CARTESIAN_POINT('',(${v.map(r).join(",")}))`);
  const dir = (v: V3) => add(`DIRECTION('',(${v.map(r).join(",")}))`);

  const appCtx = add("APPLICATION_CONTEXT('automotive design')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`);
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`);
  const product = add(`PRODUCT(${str(name)},${str(name)},'',(${prodCtx}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${product}))`);
  const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
  const pdc = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`);
  const pd = add(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`);
  const mm = add("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )");
  const rad = add("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )");
  const sr = add("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )");
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${mm},'distance_accuracy_value','confusion accuracy')`);
  const ctx = add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${mm},${rad},${sr})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`);
  const origin = add(`AXIS2_PLACEMENT_3D('',${pt([0, 0, 0])},${dir([0, 0, 1])},${dir([1, 0, 0])})`);

  const solids = bodies.map(b => {
    const ax = unit(b.axis);
    // Direction de référence perpendiculaire à l'axe.
    const helper: V3 = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const dot = helper[0] * ax[0] + helper[1] * ax[1] + helper[2] * ax[2];
    const ref = unit([helper[0] - dot * ax[0], helper[1] - dot * ax[1], helper[2] - dot * ax[2]]);
    const top: V3 = [b.base[0] + ax[0] * b.length, b.base[1] + ax[1] * b.length, b.base[2] + ax[2] * b.length];
    const at = (c: V3): V3 => [c[0] + ref[0] * b.radius, c[1] + ref[1] * b.radius, c[2] + ref[2] * b.radius];
    const dAx = dir(ax), dRef = dir(ref);
    const pl0 = add(`AXIS2_PLACEMENT_3D('',${pt(b.base)},${dAx},${dRef})`);
    const pl1 = add(`AXIS2_PLACEMENT_3D('',${pt(top)},${dAx},${dRef})`);
    const c0 = add(`CIRCLE('',${pl0},${r(b.radius)})`);
    const c1 = add(`CIRCLE('',${pl1},${r(b.radius)})`);
    const v0 = add(`VERTEX_POINT('',${pt(at(b.base))})`);
    const v1 = add(`VERTEX_POINT('',${pt(at(top))})`);
    const e0 = add(`EDGE_CURVE('',${v0},${v0},${c0},.T.)`);
    const e1 = add(`EDGE_CURVE('',${v1},${v1},${c1},.T.)`);
    const seamLine = add(`LINE('',${pt(at(b.base))},${add(`VECTOR('',${dAx},${r(b.length)})`)})`);
    const seam = add(`EDGE_CURVE('',${v0},${v1},${seamLine},.T.)`);
    const oe = (e: string, s: boolean) => add(`ORIENTED_EDGE('',*,*,${e},${s ? ".T." : ".F."})`);
    // Face latérale : bas (sens +u), couture montante, haut (sens -u), couture descendante.
    const sideLoop = add(`EDGE_LOOP('',(${[oe(e0, true), oe(seam, true), oe(e1, false), oe(seam, false)].join(",")}))`);
    const side = add(`ADVANCED_FACE('',(${add(`FACE_OUTER_BOUND('',${sideLoop},.T.)`)}),${add(`CYLINDRICAL_SURFACE('',${pl0},${r(b.radius)})`)},.T.)`);
    // Fond (normale opposée à l'axe) et dessus (normale selon l'axe).
    const botLoop = add(`EDGE_LOOP('',(${oe(e0, false)}))`);
    const bottom = add(`ADVANCED_FACE('',(${add(`FACE_OUTER_BOUND('',${botLoop},.T.)`)}),${add(`PLANE('',${pl0})`)},.F.)`);
    const topLoop = add(`EDGE_LOOP('',(${oe(e1, true)}))`);
    const topF = add(`ADVANCED_FACE('',(${add(`FACE_OUTER_BOUND('',${topLoop},.T.)`)}),${add(`PLANE('',${pl1})`)},.T.)`);
    const shell = add(`CLOSED_SHELL('',(${side},${bottom},${topF}))`);
    return add(`MANIFOLD_SOLID_BREP(${str(b.name)},${shell})`);
  });

  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${str(name)},(${[origin, ...solids].join(",")}),${ctx})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(${pds},${rep})`);

  const stamp = date.toISOString().slice(0, 19);
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Atelier cinematique MTB - pivots et interfaces'),'2;1');",
    `FILE_NAME(${str(name + ".step")},'${stamp}',(''),(''),'mtb-kinematics','mtb-kinematics','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

// Caractères non ASCII encodés selon ISO 10303-21 (\X2\....\X0\).
function enc(c: string): string {
  return "\\X2\\" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") + "\\X0\\";
}
