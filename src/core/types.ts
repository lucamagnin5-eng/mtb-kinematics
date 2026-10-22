// Types du modèle de vélo. Unités : mm, repère cadre (origine = boîtier, x vers l'avant, y vers le haut).

export interface Vec { x: number; y: number }

export interface Point extends Vec {
  fixed: boolean;
  label: string;
}

export interface Setup {
  rearR: number;          // rayon roue arrière (mm)
  frontR: number;         // rayon roue avant (mm)
  chainring: number;      // dents plateau
  cogs: number[];         // dents des pignons étudiés
  cogHeight: number;      // hauteur du centre de gravité au sol (mm)
  shockStroke: number;    // course amortisseur (mm)
  sag: number;            // sag (% de la course amortisseur)
  forkA2C: number;        // fourche axe-té (mm)
  forkOffset: number;     // déport (mm)
  forkTravel: number;     // débattement fourche (mm)
  forkSag: number;        // sag fourche (%)
  saddleHeight: number;   // hauteur de selle depuis le boîtier (mm)
}

export interface BikeModel {
  preset?: string;
  name?: string;
  points: Record<string, Point>;
  /** Biellettes : paires de points dont la distance reste constante. */
  links: [string, string][];
  /** Corps rigides (pour l'affichage et l'export 3D). */
  bodies: string[][];
  shock: [string, string];
  axle: string;
  /** Deux points du corps qui porte l'axe arrière (et l'étrier) : sert au centre instantané. */
  axleBody: [string, string];
  setup: Setup;
  headTop: string;
  headBottom: string;
  seatTop: string;
  seatBottom: string;
}
