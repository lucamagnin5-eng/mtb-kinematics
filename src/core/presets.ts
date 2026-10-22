// Bibliothèque de cinématiques. Les cotes sont des exemples réalistes (enduro / trail 29"),
// pas celles d'un vélo du commerce. Les points de suspension ont été réglés avec
// scripts/tune-presets.ts pour obtenir un débattement et une progressivité plausibles.

import { forkA2C, type ShockMount } from "./catalog";
import { applyFrame, fitShock, type FrameDims } from "./frame";
import type { BikeModel, Point, Setup } from "./types";

export interface Layout {
  name: string;
  description: string;
  /** Points de suspension (le cadre et l'axe arrière sont ajoutés automatiquement). */
  points: Record<string, Point>;
  links: [string, string][];
  bodies: string[][];
  shock: [string, string];
  axleBody: [string, string];
  idler?: Point;
  shockSize: [ShockMount, number, number];
  /** Débattement visé lors du réglage des points (mm). */
  travelTarget: number;
}

const fx = (x: number, y: number, label: string): Point => ({ x, y, fixed: true, label });
const mv = (x: number, y: number, label: string): Point => ({ x, y, fixed: false, label });

export const LAYOUTS: Record<string, Layout> = {
  "single-pivot": {
    name: "Single pivot (direct mount)",
    description: "Swingarm on one main pivot, shock driven directly by the swingarm.",
    points: {
      MP: fx(-25, 85, "Main pivot"),
      SF: fx(151.6, 167.2, "Shock frame mount"),
      R: mv(-34, 265.4, "Shock eye (swingarm)"),
    },
    links: [["MP", "A"], ["MP", "R"], ["A", "R"]],
    bodies: [["MP", "A", "R"]],
    shock: ["SF", "R"], axleBody: ["MP", "A"],
    shockSize: ["metric", 210, 55], travelTarget: 140,
  },
  "linkage-single-pivot": {
    name: "Linkage-driven single pivot",
    description: "Single pivot swingarm, shock driven through a rocker link.",
    points: {
      MP: fx(-33.8, 77.1, "Main pivot"),
      RP: fx(-26.3, 301.9, "Rocker pivot"),
      SF: fx(110.1, 155.3, "Shock frame mount"),
      Y: mv(-208.4, 286.2, "Seatstay–link pivot"),
      S: mv(-128.7, 365.6, "Link–rocker pivot"),
      R: mv(15, 364.7, "Shock eye (rocker)"),
    },
    links: [["MP", "A"], ["MP", "Y"], ["A", "Y"], ["Y", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "A", "Y"], ["Y", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axleBody: ["MP", "A"],
    shockSize: ["metric", 230, 65], travelTarget: 160,
  },
  "split-pivot": {
    name: "Faux-bar / split pivot",
    description: "Seatstay pivot concentric with the rear axle; the axle stays on the chainstay (single pivot path).",
    points: {
      MP: fx(-31.5, 76.3, "Main pivot"),
      RP: fx(-4, 355.8, "Rocker pivot"),
      SF: fx(92.7, 209.7, "Shock frame mount"),
      S: mv(-164.3, 377.4, "Seatstay–rocker pivot"),
      R: mv(56.7, 411.5, "Shock eye (rocker)"),
    },
    links: [["MP", "A"], ["A", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "A"], ["A", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axleBody: ["MP", "A"],
    shockSize: ["trunnion", 205, 60], travelTarget: 150,
  },
  horst: {
    name: "Horst link / FSR (4-bar)",
    description: "Chainstay pivot ahead of the axle; the axle rides on the seatstay.",
    points: {
      MP: fx(-44.9, 59.8, "Main pivot"),
      RP: fx(-11, 347, "Rocker pivot"),
      SF: fx(116.5, 184.9, "Shock frame mount"),
      H: mv(-381, 6.1, "Horst pivot"),
      S: mv(-167.4, 375.1, "Seatstay–rocker pivot"),
      R: mv(46.2, 403.9, "Shock eye (rocker)"),
    },
    links: [["MP", "H"], ["H", "A"], ["A", "S"], ["H", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "H"], ["H", "A", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axleBody: ["A", "S"],
    shockSize: ["metric", 230, 65], travelTarget: 160,
  },
  dw: {
    name: "DW-link / Maestro (twin short links)",
    description: "Floating rear triangle on two short co-rotating links; the upper link drives the shock.",
    points: {
      LP: fx(82.9, 76, "Lower link frame pivot"),
      UP: fx(-33.3, 241.2, "Upper link frame pivot"),
      SF: fx(148.3, 136.1, "Shock frame mount"),
      L: mv(-14, 69.7, "Lower link–rear pivot"),
      U: mv(-151.1, 385.6, "Upper link–rear pivot"),
      R: mv(18.7, 326.2, "Shock eye (upper link)"),
    },
    links: [["LP", "L"], ["UP", "U"], ["L", "U"], ["L", "A"], ["U", "A"], ["UP", "R"], ["U", "R"]],
    bodies: [["LP", "L"], ["L", "U", "A"], ["UP", "U", "R"]],
    shock: ["SF", "R"], axleBody: ["L", "U"],
    shockSize: ["metric", 230, 65], travelTarget: 160,
  },
  vpp: {
    name: "VPP (counter-rotating links)",
    description: "Floating rear triangle on two counter-rotating short links; the lower link drives the shock.",
    points: {
      LP: fx(54.3, 143.5, "Lower link frame pivot"),
      UP: fx(61.3, 236.1, "Upper link frame pivot"),
      SF: fx(107.8, 339.1, "Shock frame mount"),
      L: mv(-104.7, 137.7, "Lower link–rear pivot"),
      U: mv(-162.8, 282.8, "Upper link–rear pivot"),
      R: mv(-30.8, 188, "Shock eye (lower link)"),
    },
    links: [["LP", "L"], ["UP", "U"], ["L", "U"], ["L", "A"], ["U", "A"], ["LP", "R"], ["L", "R"]],
    bodies: [["LP", "L", "R"], ["L", "U", "A"], ["UP", "U"]],
    shock: ["SF", "R"], axleBody: ["L", "U"],
    shockSize: ["trunnion", 205, 65], travelTarget: 160,
  },
  "high-single-pivot": {
    name: "High pivot single pivot + idler",
    description: "High main pivot for a rearward axle path, with an idler pulley to control chain growth.",
    points: {
      MP: fx(-60, 270, "Main pivot"),
      RP: fx(-30.4, 342.8, "Rocker pivot"),
      SF: fx(113.9, 214.4, "Shock frame mount"),
      Y: mv(-185.6, 313.7, "Seatstay–link pivot"),
      S: mv(-75.3, 422.3, "Link–rocker pivot"),
      R: mv(45.2, 433.9, "Shock eye (rocker)"),
    },
    links: [["MP", "A"], ["MP", "Y"], ["A", "Y"], ["Y", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "A", "Y"], ["Y", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axleBody: ["MP", "A"],
    idler: fx(-5.6, 277.5, "Idler pulley"),
    shockSize: ["metric", 230, 65], travelTarget: 165,
  },
  "high-horst": {
    name: "High pivot Horst link + idler",
    description: "High pivot four-bar with a chainstay pivot ahead of the axle, and an idler pulley.",
    points: {
      MP: fx(-60, 270, "Main pivot"),
      RP: fx(-27.9, 354.7, "Rocker pivot"),
      SF: fx(131.4, 246.8, "Shock frame mount"),
      H: mv(-386.7, 78.4, "Horst pivot"),
      S: mv(-107.5, 415.8, "Seatstay–rocker pivot"),
      R: mv(32.2, 454.4, "Shock eye (rocker)"),
    },
    links: [["MP", "H"], ["H", "A"], ["A", "S"], ["H", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "H"], ["H", "A", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axleBody: ["A", "S"],
    idler: fx(-5.2, 273.9, "Idler pulley"),
    shockSize: ["metric", 230, 65], travelTarget: 170,
  },
};

export const DEFAULT_FRAME: FrameDims = {
  reach: 475, stack: 630, headAngle: 64, headTube: 110,
  seatAngle: 76, seatTube: 440, chainstay: 440, bbDrop: 30,
};

export function defaultSetup(): Setup {
  return {
    wheels: { front: "29", rear: "29", frontTire: 2.4, rearTire: 2.4 },
    shock: { mount: "metric", eye2eye: 230, stroke: 65 },
    sag: 30,
    fork: { model: "fox36", travel: 160, offset: 44, a2c: forkA2C("fox36", "29", 160), sag: 20 },
    chainring: 32,
    cogs: [52, 30, 10],
    idlerTeeth: 16,
    cogHeight: 1100,
    saddleHeight: 740,
  };
}

export function makeModel(key: string, frame: FrameDims = DEFAULT_FRAME): BikeModel {
  const L = LAYOUTS[key];
  const points: Record<string, Point> = {
    BB: fx(0, 0, "Bottom bracket"),
    HT: fx(0, 0, "Head tube top"),
    HB: fx(0, 0, "Head tube bottom"),
    ST: fx(0, 0, "Seat tube top"),
    SB: fx(-40, 90, "Seat tube bottom"),
    A: mv(0, 0, "Rear axle"),
    ...structuredClone(L.points),
  };
  if (L.idler) points.I = { ...L.idler };
  const m: BikeModel = {
    version: 2, preset: key, name: L.name, points,
    links: structuredClone(L.links), bodies: structuredClone(L.bodies),
    shock: [...L.shock], axle: "A", axleBody: [...L.axleBody], idler: L.idler ? "I" : null,
    setup: defaultSetup(),
    headTop: "HT", headBottom: "HB", seatTop: "ST", seatBottom: "SB",
  };
  applyFrame(m, frame);
  fitShock(m, ...L.shockSize);
  return m;
}
