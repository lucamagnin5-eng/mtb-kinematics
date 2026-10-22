// Cotes de conception du cadre, mesurées depuis le boîtier dans le repère cadre.
// Ce sont des vues sur les points du modèle : les lire ou les écrire modifie directement
// les points (tube de direction, tube de selle, axe arrière).

import type { BikeModel, Vec } from "./types";

export interface FrameDims {
  reach: number;
  stack: number;
  headAngle: number;    // °, depuis l'horizontale
  headTube: number;     // longueur de douille (mm)
  seatAngle: number;    // ° réel
  seatTube: number;     // boîtier -> haut du tube de selle (mm)
  chainstay: number;    // boîtier -> axe arrière (mm)
  bbDrop: number;       // axe arrière au-dessus du boîtier (mm)
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function readFrame(m: BikeModel): FrameDims {
  const HT = m.points[m.headTop], HB = m.points[m.headBottom];
  const ST = m.points[m.seatTop], SB = m.points[m.seatBottom], A = m.points[m.axle], BB = m.points.BB;
  return {
    reach: HT.x - BB.x,
    stack: HT.y - BB.y,
    headAngle: 180 - deg(Math.atan2(HT.y - HB.y, HT.x - HB.x)),
    headTube: Math.hypot(HT.x - HB.x, HT.y - HB.y),
    seatAngle: 180 - deg(Math.atan2(ST.y - SB.y, ST.x - SB.x)),
    seatTube: Math.hypot(ST.x - BB.x, ST.y - BB.y),
    chainstay: Math.hypot(A.x - BB.x, A.y - BB.y),
    bbDrop: A.y - BB.y,
  };
}

/** Modifie une cote et met à jour les points correspondants. */
export function writeFrame(m: BikeModel, key: keyof FrameDims, value: number): void {
  applyFrame(m, { ...readFrame(m), [key]: value }, key === "chainstay" || key === "bbDrop");
}

/** Place tous les points du cadre d'après les cotes ; moveAxle repositionne aussi l'axe arrière. */
export function applyFrame(m: BikeModel, f: FrameDims, moveAxle = true): void {
  const P = m.points, BB = P.BB;
  const set = (id: string, v: Vec) => { P[id].x = v.x; P[id].y = v.y; };
  // Tube de direction : haut à (reach, stack), bas le long de l'angle de direction.
  const HT = { x: BB.x + f.reach, y: BB.y + f.stack };
  set(m.headTop, HT);
  set(m.headBottom, { x: HT.x + f.headTube * Math.cos(rad(f.headAngle)), y: HT.y - f.headTube * Math.sin(rad(f.headAngle)) });
  // Tube de selle : droite issue du bas du tube, haut à "seatTube" du boîtier.
  const SB = P[m.seatBottom], dir = { x: -Math.cos(rad(f.seatAngle)), y: Math.sin(rad(f.seatAngle)) };
  const w = { x: SB.x - BB.x, y: SB.y - BB.y }, b = w.x * dir.x + w.y * dir.y, c = w.x * w.x + w.y * w.y - f.seatTube ** 2;
  const s = -b + Math.sqrt(Math.max(0, b * b - c));
  set(m.seatTop, { x: SB.x + dir.x * s, y: SB.y + dir.y * s });
  // Axe arrière : base et drop.
  if (moveAxle) {
    const drop = Math.max(-f.chainstay + 1, Math.min(f.chainstay - 1, f.bbDrop));
    set(m.axle, { x: BB.x - Math.sqrt(f.chainstay ** 2 - drop ** 2), y: BB.y + drop });
  }
}

/**
 * Applique un amortisseur du commerce : l'œil côté cadre est déplacé le long de l'axe
 * de l'amortisseur pour que l'entraxe détendu soit exactement celui du catalogue.
 */
export function fitShock(m: BikeModel, mount: BikeModel["setup"]["shock"]["mount"], eye2eye: number, stroke: number): void {
  m.setup.shock = { mount, eye2eye, stroke };
  const [frameEye, linkEye] = m.shock;
  const F = m.points[frameEye], R = m.points[linkEye];
  const d = Math.hypot(F.x - R.x, F.y - R.y);
  F.x = R.x + ((F.x - R.x) / d) * eye2eye;
  F.y = R.y + ((F.y - R.y) / d) * eye2eye;
}

/** Active ou retire la poulie folle (point fixe "I", placé par défaut devant le pivot principal). */
export function setIdler(m: BikeModel, on: boolean): void {
  if (!on) {
    if (m.idler) delete m.points[m.idler];
    m.idler = null;
    return;
  }
  if (m.idler) return;
  const fixed = Object.entries(m.points).filter(([id, p]) => p.fixed && !["BB", m.headTop, m.headBottom, m.seatTop, m.seatBottom, ...m.shock].includes(id));
  // Par défaut : 30 mm devant et 15 mm sous le pivot fixe le plus proche de l'axe (pivot principal).
  const A = m.points[m.axle], dA = (p: Vec) => Math.hypot(p.x - A.x, p.y - A.y);
  const main = fixed.sort((a, b) => dA(a[1]) - dA(b[1]))[0]?.[1] ?? { x: -30, y: 250 };
  m.points.I = { x: main.x + 30, y: main.y - 15, fixed: true, label: "Idler pulley" };
  m.idler = "I";
}
