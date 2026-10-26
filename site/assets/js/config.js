/**
 * BubbleWave — configuration du scénario.
 *
 * Le protocole impose un matériau et une épaisseur fixes. Toutes les valeurs
 * du mur sont donc centralisées ici : il suffit de modifier ce fichier pour
 * changer le scénario, sans toucher à l'interface ni aux calculs.
 */
export const WALL = Object.freeze({
  material: "Béton sec",
  materialShort: "Béton",
  epsReal: 6.0,
  tanDelta: 0.03,
  thicknessM: 0.09,
  thicknessCm: 9.0,
  bubbleRadiusM: 0.0005,
  bubbleRadiusMm: 0.5,
  epsInclusion: 1.0,
  epsOuter: 1.0,
  muR: 1.0,
  // Repères de la littérature : béton sec, quelques GHz.
  reference: "Ordre de grandeur usuel : ε′ ≈ 4–9, tan δ ≈ 0,01–0,05 pour un béton sec.",
});

export const DEFAULTS = Object.freeze({
  bubbleFraction: 0.2,
  frequencyHz: 1.0e9,
  thetaDeg: 0,
  polarization: "TE",
});

export const RANGES = Object.freeze({
  bubbleFraction: { min: 0, max: 0.5, step: 0.005 },
  frequencyHz: { min: 0.5e9, max: 6.0e9, step: 0.01e9 },
  thetaDeg: { min: 0, max: 80, step: 1 },
});

export const PRESETS = Object.freeze([
  { label: "Mur plein", value: 0, hint: "Aucune bulle" },
  { label: "10 %", value: 0.1, hint: "Porosité faible" },
  { label: "20 %", value: 0.2, hint: "Scénario de référence" },
  { label: "35 %", value: 0.35, hint: "Porosité élevée" },
  { label: "50 %", value: 0.5, hint: "Limite du modèle" },
]);

export const SITE = Object.freeze({
  name: "BubbleWave",
  tagline: "Propagation des ondes électromagnétiques dans un mur à bulles",
  course: "Propagation dans les milieux — GSR1",
  school: "ENSA Tanger",
  year: "2026 / 2027",
  // Laissez vide pour masquer la ligne « réalisé par ».
  author: "",
  // URL complète du dépôt GitHub. Laissez vide pour masquer les liens.
  github: "https://github.com/alae35846/BubbleWave",
  email: "",
});
