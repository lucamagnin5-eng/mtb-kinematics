# Atelier cinématique MTB

Logiciel desktop (Windows / macOS) pour concevoir et analyser la géométrie et la cinématique
d'une suspension arrière de VTT, dans l'esprit de Linkage, avec un solveur générique.

## Ce que fait la version 0.1

- **Solveur plan générique** : chaque biellette est une contrainte de distance, la pose est résolue
  par Newton-Raphson tous les 0,5 mm de débattement roue. Pas de liste figée de types de suspension :
  tout mécanisme à 1 degré de liberté fonctionne.
- **Modèles d'exemple** : Horst link, monopivot à biellette, double biellette courte (DW / VPP).
  Leurs cotes sont des exemples, pas celles d'un vélo du commerce.
- **Courbes** : rapport de levier, anti-squat (3 pignons), anti-rise, pedal kickback,
  trajectoire d'axe, course amortisseur utilisée.
- **Géométrie** détendue, au sag et à la position courante : angles de direction et de selle,
  reach, stack, hauteur et drop du boîtier, bases, front center, empattement, chasse, assiette.
- **Fichiers** : projets `.mtbk` (JSON) à ouvrir / enregistrer, export CSV des courbes.
- **Export 3D STEP** (AP214) à la position affichée : un cylindre nommé par pivot et interface
  (axe arrière 12×148, boîtier 41×73, œils d'amortisseur 8×22, pivots 15×60, tubes de direction
  et de selle), plus le squelette des biellettes et de l'amortisseur dans le plan médian (z = 0).
  Les diamètres et largeurs se règlent par point avec les champs `d` et `w` du fichier projet.

## Conventions

- Unités en mm, repère cadre : origine au boîtier, x vers l'avant, y vers le haut.
- Les longueurs des biellettes sont prises dans la position saisie, qui est l'état détendu.
- Les cotes de géométrie sont mesurées roues posées au sol, fourche à son sag.
- Anti-squat : droite du contact arrière vers l'intersection du brin de chaîne tendu et de la droite
  axe–centre instantané, rapportée à la hauteur du centre de gravité au droit du contact avant.
- Anti-rise : droite du contact arrière vers le centre instantané du corps qui porte l'étrier
  (supposé être celui qui porte l'axe).
- Pedal kickback : rotation du plateau due à l'allongement du brin supérieur, roue immobile.
  C'est une première approximation, à affiner.

## Développement

Prérequis : Node 22, Rust stable, et les [prérequis Tauri](https://tauri.app/start/prerequisites/)
de ta plateforme.

```bash
npm install
npm run tauri dev     # appli desktop en mode développement
npm run dev           # interface seule dans le navigateur (http://localhost:1420)
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

- Saisie des diamètres / largeurs d'interface dans l'interface (aujourd'hui dans le fichier projet).
- Comparaison de deux vélos en superposition.
- Poulie folle (high pivot), étrier sur un autre corps que celui de l'axe.
- Kickback exact avec rotation du pignon et de la roue.
