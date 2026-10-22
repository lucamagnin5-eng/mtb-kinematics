# MTB Kinematics Lab

Logiciel desktop (Windows / macOS) pour concevoir et analyser la géométrie et la cinématique
d'une suspension arrière de VTT, dans l'esprit de Linkage, avec un solveur générique.

## Ce que fait la version 0.3

Interface en anglais.

- **Solveur plan générique** : chaque biellette est une contrainte de distance, la pose est résolue
  par Newton-Raphson tous les 0,5 mm de débattement roue. Tout mécanisme à 1 degré de liberté fonctionne.
- **8 cinématiques d'exemple** : monopivot direct, monopivot à biellette, faux-bar / split pivot,
  Horst link (FSR), DW-link / Maestro, VPP, pivot haut monopivot + poulie, pivot haut Horst + poulie.
  Leurs cotes sont des exemples réglés automatiquement (`scripts/tune-presets.ts`), pas celles de vélos du commerce.
- **Cadre défini depuis le boîtier** : reach, stack, angle et longueur de douille, angle et longueur
  de tube de selle, base et BB drop. Ces cotes modifient directement les points du cadre.
- **Composants du commerce** : amortisseurs Metric et Trunnion aux tailles standard (l'œil côté cadre est
  recalé pour respecter exactement l'entraxe), fourches courantes (axe-té et déports publiés),
  roues 26" / 27.5" / 29" / 32" avec largeur de pneu, avant et arrière séparés (mulet possible).
- **Fourche indépendante** : un curseur de compression de fourche, séparé du curseur arrière.
- **Poulie folle** optionnelle : le brin tendu passe par la poulie ; anti-squat et kickback en tiennent compte.
- **Courbes** : rapport de levier, anti-squat (3 pignons), anti-rise, pedal kickback,
  trajectoire d'axe, course amortisseur utilisée.
- **Géométrie** mesurée au sol : statique, au sag, et à la position des curseurs.
- **Efforts aux pivots** (v0.3) : statique plane pour une charge verticale réglable sur la roue arrière ;
  effort dans chaque pivot et dans l'amortisseur, en tableau, en courbes et sur la vue.
- **Comparaison** (v0.3) : figer le vélo actuel ou charger un projet comme référence ; il s'affiche en
  pointillés sur la vue et les courbes, et la géométrie au sag est comparée (colonne Δ).
- **Flip chips et pattes réglables** (v0.3) : positions possibles d'un pivot ou de l'axe arrière.
  Les pièces gardent leurs cotes et la suspension est remontée à l'entraxe de l'amortisseur, comme sur un vrai vélo.
- **Cadre figé et explorateur de géométrie** (v0.3) : le cadre et les pivots sont verrouillés ; on change la
  fourche, l'amortisseur et les puces. L'explorateur liste la géométrie de toutes les combinaisons
  puces × débattements de la fourche.
- **Fichiers** : projets `.mtbk` (JSON, version 2), export CSV, export 3D STEP (AP214) des pivots,
  interfaces et biellettes.

## Conventions

- Unités en mm, repère cadre : origine au boîtier, x vers l'avant, y vers le haut.
- Les longueurs des biellettes sont prises dans la position saisie, qui est l'état détendu.
- Les cotes de conception du cadre sont dans les axes du cadre ; le tableau de géométrie donne
  les valeurs mesurées roues posées au sol (l'assiette du cadre y est indiquée).
- Anti-squat : droite du contact arrière vers l'intersection du brin de chaîne tendu et de la droite
  axe–centre instantané, rapportée à la hauteur du centre de gravité au droit du contact avant.
- Anti-rise : droite du contact arrière vers le centre instantané du corps qui porte l'étrier
  (supposé être celui qui porte l'axe).
- Pedal kickback : rotation du plateau due à l'allongement du brin tendu (poulie comprise), roue immobile.
  C'est une première approximation, à affiner.
- Axe-té des fourches : valeurs publiées courantes ; en 26" et 32", estimation par écart de rayon de jante.

## Développement

Prérequis : Node 22, Rust stable, et les [prérequis Tauri](https://tauri.app/start/prerequisites/)
de ta plateforme.

```bash
npm install
npm run tauri dev     # appli desktop en mode développement
npm run dev           # interface seule dans le navigateur (http://localhost:1420)
npm run build:web     # version web autonome en un seul fichier : dist-web/index.html
npm test              # tests du moteur cinématique
npm run tauri build   # installeur pour la machine courante
```

Les installeurs Windows et macOS sont construits par GitHub Actions
(workflow « Installeurs Windows / Mac », lancement manuel ou tag `v*`).

## Organisation

```
src/core/      moteur cinématique (sans dépendance à l'interface)
src/ui/        interface : vue vélo, courbes, tableau de géométrie, fichiers
tests/         tests du moteur (dont comparaison à une solution analytique)
src-tauri/     coquille desktop Tauri (Rust)
```

## Prochaines étapes

- Comparer les calculs avec Linkage sur un vélo réel.
- Comparaison de deux vélos en superposition.
- Poulie folle montée sur un corps mobile, étrier sur un autre corps que celui de l'axe.
- Kickback exact avec rotation du pignon et de la roue.
- Saisie des diamètres / largeurs d'interface dans l'interface (aujourd'hui dans le fichier projet).
