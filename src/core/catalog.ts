// Composants du commerce : roues, amortisseurs, fourches.
// Les axe-té de fourche sont des valeurs courantes publiées (à ±3 mm près selon les années) :
// à vérifier sur la fiche du fabricant pour un calcul définitif.

export type WheelSize = "26" | "27.5" | "29" | "32";

/** Diamètre de jante ISO (BSD, mm). */
export const WHEELS: Record<WheelSize, { label: string; bsd: number }> = {
  "26": { label: '26"', bsd: 559 },
  "27.5": { label: '27.5" (650b)', bsd: 584 },
  "29": { label: '29"', bsd: 622 },
  "32": { label: '32"', bsd: 686 },
};

export const TIRE_WIDTHS = [2.2, 2.3, 2.35, 2.4, 2.5, 2.6, 2.8];

/** Rayon roue gonflée : jante + hauteur de pneu (≈ 0,95 × largeur pour un pneu VTT). */
export function wheelRadius(size: WheelSize, tireInches: number): number {
  return WHEELS[size].bsd / 2 + tireInches * 25.4 * 0.95;
}

export type ShockMount = "metric" | "trunnion";

/** Tailles d'amortisseurs du commerce : entraxe × course (mm). */
export const SHOCKS: Record<ShockMount, { label: string; sizes: [number, number][] }> = {
  metric: {
    label: "Metric",
    sizes: [
      [190, 40], [190, 42.5], [190, 45],
      [210, 47.5], [210, 50], [210, 52.5], [210, 55],
      [230, 57.5], [230, 60], [230, 62.5], [230, 65],
      [250, 67.5], [250, 70], [250, 72.5], [250, 75],
    ],
  },
  trunnion: {
    label: "Trunnion",
    sizes: [
      [165, 37.5], [165, 40], [165, 42.5], [165, 45],
      [185, 47.5], [185, 50], [185, 52.5], [185, 55],
      [205, 57.5], [205, 60], [205, 62.5], [205, 65],
      [225, 70], [225, 72.5], [225, 75],
    ],
  },
};

export interface ForkModel {
  name: string;
  travels: number[];
  /** Axe-té = base + débattement, pour une roue de 29" (et 27.5" quand la version existe). */
  base29: number;
  base275?: number;
  /** Axe-té fixe (fourche double té). */
  fixedA2C29?: number;
  fixedA2C275?: number;
  offsets: Partial<Record<WheelSize, number[]>>;
}

export const FORKS: Record<string, ForkModel> = {
  sid: { name: "RockShox SID", travels: [100, 110, 120], base29: 413, offsets: { "29": [44] } },
  fox34: { name: "Fox 34", travels: [120, 130, 140], base29: 411, base275: 397, offsets: { "29": [44, 51], "27.5": [37, 44] } },
  pike: { name: "RockShox Pike", travels: [120, 130, 140], base29: 411, base275: 397, offsets: { "29": [42, 44], "27.5": [37] } },
  fox36: { name: "Fox 36", travels: [140, 150, 160], base29: 411, base275: 397, offsets: { "29": [44, 51], "27.5": [37, 44] } },
  lyrik: { name: "RockShox Lyrik", travels: [140, 150, 160], base29: 411, base275: 397, offsets: { "29": [42, 44], "27.5": [37] } },
  fox38: { name: "Fox 38", travels: [160, 170, 180], base29: 423, base275: 409, offsets: { "29": [44], "27.5": [37] } },
  zeb: { name: "RockShox ZEB", travels: [150, 160, 170, 180, 190], base29: 418, base275: 405, offsets: { "29": [38, 44], "27.5": [38, 44] } },
  fox40: { name: "Fox 40 (dual crown)", travels: [203], base29: 0, fixedA2C29: 583, fixedA2C275: 568, offsets: { "29": [52], "27.5": [48] } },
  boxxer: { name: "RockShox Boxxer (dual crown)", travels: [200], base29: 0, fixedA2C29: 586, fixedA2C275: 568, offsets: { "29": [48, 52], "27.5": [46] } },
};

/**
 * Axe-té (mm). Valeurs publiées en 29" et 27.5" ; en 26" et 32", on décale la valeur la plus
 * proche de l'écart de rayon de jante (estimation).
 */
export function forkA2C(model: string, wheel: WheelSize, travel: number): number {
  const f = FORKS[model];
  const a29 = f.fixedA2C29 ?? f.base29 + travel;
  const a275 = f.fixedA2C275 ?? (f.base275 !== undefined ? f.base275 + travel : a29 - (WHEELS["29"].bsd - WHEELS["27.5"].bsd) / 2);
  const shift = (from: WheelSize) => (WHEELS[wheel].bsd - WHEELS[from].bsd) / 2;
  const a = wheel === "29" ? a29 : wheel === "27.5" ? a275 : wheel === "26" ? a275 + shift("27.5") : a29 + shift("29");
  return Math.round(a * 10) / 10;
}

export function forkOffsets(model: string, wheel: WheelSize): number[] {
  const f = FORKS[model];
  return f.offsets[wheel] ?? f.offsets["29"] ?? [44];
}

export const CHAINRINGS = [28, 30, 32, 34, 36];
export const COGS = [9, 10, 11, 12, 13, 15, 17, 19, 21, 24, 28, 30, 32, 36, 40, 42, 45, 46, 50, 51, 52];
export const IDLERS = [14, 15, 16, 17, 18, 20];
