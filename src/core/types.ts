// Types du modèle de vélo. Unités : mm, repère cadre (origine = boîtier, x vers l'avant, y vers le haut).

import type { ShockMount, WheelSize } from "./catalog";

export interface Vec { x: number; y: number }

export interface Point extends Vec {
  fixed: boolean;
  label: string;
  /** Diamètre de l'interface pour l'export 3D (mm). Valeur par défaut selon le rôle du point. */
  d?: number;
  /** Largeur de l'interface (le long de l'axe du pivot) pour l'export 3D (mm). */
  w?: number;
}

export interface Setup {
  wheels: { front: WheelSize; rear: WheelSize; frontTire: number; rearTire: number };
  shock: { mount: ShockMount; eye2eye: number; stroke: number };
  /** Sag arrière (% de la course amortisseur). */
  sag: number;
  fork: { model: string; travel: number; offset: number; a2c: number; sag: number };
  chainring: number;
  cogs: number[];
  idlerTeeth: number;
  cogHeight: number;      // hauteur du centre de gravité au sol (mm)
  saddleHeight: number;   // hauteur de selle depuis le boîtier (mm)
}

export interface BikeModel {
  version: 2;
  preset?: string;
  name?: string;
  points: Record<string, Point>;
  /** Biellettes : paires de points dont la distance reste constante. */
  links: [string, string][];
  /** Corps rigides (pour l'affichage et l'export 3D). */
  bodies: string[][];
  /** Œil côté cadre (corps de l'amortisseur), œil côté biellette. */
  shock: [string, string];
  axle: string;
  /** Deux points du corps qui porte l'axe arrière (et l'étrier) : sert au centre instantané. */
  axleBody: [string, string];
  /** Point fixe portant la poulie folle, ou null sans poulie. */
  idler: string | null;
  setup: Setup;
  headTop: string;
  headBottom: string;
  seatTop: string;
  seatBottom: string;
}
