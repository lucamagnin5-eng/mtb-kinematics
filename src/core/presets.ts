// Modèles de départ. Ce sont des exemples aux cotes approximatives d'un enduro 29",
// pas les cotes d'un vélo du commerce.

import type { BikeModel, Point, Setup } from "./types";

const SETUP: Setup = {
  rearR: 372, frontR: 372, chainring: 32, cogs: [52, 30, 10],
  cogHeight: 1100, shockStroke: 65, sag: 30,
  forkA2C: 580, forkOffset: 44, forkTravel: 170, forkSag: 20, saddleHeight: 740,
};
const FRAME: Record<string, Point> = {
  BB: { x: 0, y: 0, fixed: true, label: "Boîtier" },
  HT: { x: 455, y: 625, fixed: true, label: "Haut douille" },
  HB: { x: 503, y: 526, fixed: true, label: "Bas douille" },
  ST: { x: -175, y: 600, fixed: true, label: "Haut tube de selle" },
  SB: { x: -45, y: 90, fixed: true, label: "Bas tube de selle" },
};
type Preset = Pick<BikeModel, "name" | "points" | "links" | "bodies" | "shock" | "axle" | "axleBody">;

export const PRESETS: Record<string, Preset> = {
  horst: {
    name: "Horst link (4 barres)",
    points: {
      ...FRAME,
      MP: { x: -40, y: 62, fixed: true, label: "Pivot principal" },
      RP: { x: -11, y: 347, fixed: true, label: "Pivot biellette" },
      SF: { x: 113, y: 183, fixed: true, label: "Ancrage amortisseur" },
      H: { x: -379, y: 8, fixed: false, label: "Pivot Horst" },
      A: { x: -437, y: 34, fixed: false, label: "Axe roue arrière" },
      S: { x: -164, y: 389, fixed: false, label: "Hauban / biellette" },
      R: { x: 47, y: 403, fixed: false, label: "Œil amortisseur" },
    },
    links: [["MP", "H"], ["H", "A"], ["A", "S"], ["H", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "H"], ["H", "A", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axle: "A", axleBody: ["A", "S"],
  },
  singlepivot: {
    name: "Monopivot à biellette",
    points: {
      ...FRAME,
      MP: { x: -36, y: 79, fixed: true, label: "Pivot principal" },
      RP: { x: -28, y: 303, fixed: true, label: "Pivot biellette" },
      SF: { x: 115, y: 174, fixed: true, label: "Ancrage amortisseur" },
      A: { x: -437, y: 34, fixed: false, label: "Axe roue arrière" },
      Y: { x: -177, y: 285, fixed: false, label: "Ancrage hauban" },
      S: { x: -124, y: 374, fixed: false, label: "Biellette arrière" },
      R: { x: 17, y: 382, fixed: false, label: "Œil amortisseur" },
    },
    links: [["MP", "A"], ["MP", "Y"], ["A", "Y"], ["Y", "S"], ["RP", "S"], ["RP", "R"], ["S", "R"]],
    bodies: [["MP", "A", "Y"], ["Y", "S"], ["RP", "S", "R"]],
    shock: ["SF", "R"], axle: "A", axleBody: ["MP", "A"],
  },
  dw: {
    name: "Double biellette courte (type DW / VPP)",
    points: {
      ...FRAME,
      LP: { x: 62, y: 73, fixed: true, label: "Pivot biellette basse" },
      UP: { x: -33, y: 251, fixed: true, label: "Pivot biellette haute" },
      SF: { x: 154, y: 141, fixed: true, label: "Ancrage amortisseur" },
      L: { x: -23, y: 32, fixed: false, label: "Biellette basse / arrière" },
      U: { x: -156, y: 381, fixed: false, label: "Biellette haute / arrière" },
      A: { x: -437, y: 34, fixed: false, label: "Axe roue arrière" },
      R: { x: 21, y: 328, fixed: false, label: "Œil amortisseur" },
    },
    links: [["LP", "L"], ["UP", "U"], ["L", "U"], ["L", "A"], ["U", "A"], ["UP", "R"], ["U", "R"]],
    bodies: [["LP", "L"], ["L", "U", "A"], ["UP", "U", "R"]],
    shock: ["SF", "R"], axle: "A", axleBody: ["L", "U"],
  },
};
export function makeModel(key: string): BikeModel {
  const p: Preset = structuredClone(PRESETS[key]);
  return { preset: key, ...p, setup: { ...SETUP }, headTop: "HT", headBottom: "HB", seatTop: "ST", seatBottom: "SB" };
}
