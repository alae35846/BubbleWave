/**
 * BubbleWave — logique de l'interface.
 *
 * Aucun framework, aucune dépendance : ce module relie les curseurs au noyau
 * physique, dessine l'animation de la coupe, alimente les graphiques et gère
 * les interactions (thème, partage, export, présentation).
 */

import {
  cx,
  computeSlab,
  electricFieldProfile,
  maxwellGarnett,
  matrixPermittivity,
  sweepDensity,
  sweepFrequency,
  sweepAngle,
  brewsterAngle,
  validateModel,
  seededRandom,
} from "./physics.js";
import { WALL, DEFAULTS, RANGES, PRESETS, SITE } from "./config.js";
import { CanvasChart } from "./charts.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const $id = (id) => document.getElementById(id);

const EPS_AIR = Object.freeze({ re: WALL.epsInclusion, im: 0 });
const EPS_MATRIX = matrixPermittivity(WALL.epsReal, WALL.tanDelta);
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const CHART_TABS = Object.freeze(["density", "frequency", "angle", "field"]);

/* --------------------------------------------------------------------------
   Formatage français
   -------------------------------------------------------------------------- */

const numberFormatters = new Map();

function cleanNumber(value) {
  if (!Number.isFinite(value)) return value;
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function nf(value, digits = 1) {
  if (!Number.isFinite(value)) return value === Infinity ? "∞" : "—";
  const key = String(digits);
  if (!numberFormatters.has(key)) {
    numberFormatters.set(
      key,
      new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
    );
  }
  return numberFormatters.get(key).format(cleanNumber(value)).replace("-", "−");
}

function fmtPct(value, digits = 1) {
  return `${nf(value * 100, digits)} %`;
}

function fmtGHz(hz, digits = 2) {
  return `${nf(hz / 1e9, digits)} GHz`;
}

function fmtDeg(value, digits = 0) {
  return `${nf(value, digits)}°`;
}

function fmtFrequencyFromGHz(ghz, digits = 2) {
  return `${nf(ghz, digits)} GHz`;
}

function normalizePhase(deg) {
  let value = ((deg + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(value + 180) < 1e-9) value = 180;
  return value;
}

function fmtPhase(deg) {
  return `${nf(normalizePhase(deg), 1)}°`;
}

function fmtComplex(value, digits = 2) {
  const re = cleanNumber(value.re);
  const im = cleanNumber(value.im);
  if (Math.abs(im) < 1e-9) return nf(re, digits);
  const sign = im < 0 ? "−" : "+";
  return `${nf(re, digits)} ${sign} j${nf(Math.abs(im), digits)}`;
}

const SUPERSCRIPTS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };

function toSuperscript(number) {
  return String(number)
    .split("")
    .map((char) => SUPERSCRIPTS[char] || char)
    .join("");
}

function fmtSci(value) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0 (exact)";
  if (Math.abs(value) >= 1e-3) return nf(value, 5);
  const [mantissa, exponent] = value.toExponential(1).split("e");
  return `${mantissa.replace(".", ",")} × 10${toSuperscript(Number(exponent))}`;
}

function fmtSignedPoints(value) {
  const cleaned = Math.abs(value) < 0.05 ? 0 : value;
  const sign = cleaned > 0 ? "+" : cleaned < 0 ? "−" : "";
  return `${sign}${nf(Math.abs(cleaned), 1)} pts`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* --------------------------------------------------------------------------
   État et URL
   -------------------------------------------------------------------------- */

function parseNumberParam(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function readStateFromUrl() {
  const params = new URL(window.location.href).searchParams;
  const fractionFromPhi = params.has("phi")
    ? parseNumberParam(params.get("phi"), DEFAULTS.bubbleFraction, 0, 0.5)
    : null;
  const fractionFromPercent = params.has("porosite")
    ? parseNumberParam(params.get("porosite"), DEFAULTS.bubbleFraction * 100, 0, 50) / 100
    : null;
  const chartFromUrl = params.get("vue");
  const polarization = params.get("pol") === "TM" ? "TM" : params.get("pol") === "TE" ? "TE" : DEFAULTS.polarization;

  return {
    bubbleFraction: fractionFromPhi ?? fractionFromPercent ?? DEFAULTS.bubbleFraction,
    frequencyHz:
      parseNumberParam(params.get("frequence"), DEFAULTS.frequencyHz / 1e9, 0.5, 6) * 1e9,
    thetaDeg: parseNumberParam(params.get("angle"), DEFAULTS.thetaDeg, 0, 80),
    polarization,
    chartTab: CHART_TABS.includes(chartFromUrl) ? chartFromUrl : "density",
  };
}

const initialUrlState = readStateFromUrl();

const state = {
  bubbleFraction: initialUrlState.bubbleFraction,
  frequencyHz: initialUrlState.frequencyHz,
  thetaDeg: initialUrlState.thetaDeg,
  polarization: initialUrlState.polarization,
  chartTab: initialUrlState.chartTab,
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  playing: !REDUCED_MOTION.matches,
  presenting: false,
};

let model = null;
let baselineModel = null;
let brewster = null;
let profile = null;
let validation = null;
let chart = null;
let chartInfo = null;
let updateQueued = false;

/* --------------------------------------------------------------------------
   Raccourcis DOM
   -------------------------------------------------------------------------- */

const dom = {
  header: $id("site-header"),
  mainNav: $id("main-nav"),
  menuBtn: $id("menu-btn"),
  themeToggle: $id("theme-toggle"),
  presentBtn: $id("present-btn"),
  presentExit: $id("present-exit"),
  presentationHud: $id("presentation-hud"),
  presentR: $id("present-R"),
  presentT: $id("present-T"),
  presentA: $id("present-A"),
  bubbleSlider: $id("bubble-slider"),
  bubbleValue: $id("bubble-value"),
  frequencySlider: $id("frequency-slider"),
  frequencyValue: $id("frequency-value"),
  angleSlider: $id("angle-slider"),
  angleValue: $id("angle-value"),
  presetRow: $id("preset-row"),
  shareBtn: $id("share-btn"),
  csvBtn: $id("csv-btn"),
  waveCanvas: $id("wave-canvas"),
  playBtn: $id("play-btn"),
  fullscreenBtn: $id("fullscreen-btn"),
  vizBadge: $id("viz-badge"),
  vizCaption: $id("viz-caption"),
  heroR: $id("hero-R"),
  heroT: $id("hero-T"),
  heroA: $id("hero-A"),
  heroFloatR: $id("hero-float-R"),
  heroFloatT: $id("hero-float-T"),
  resultR: $id("result-R"),
  resultT: $id("result-T"),
  resultA: $id("result-A"),
  barR: $id("bar-R"),
  barT: $id("bar-T"),
  barA: $id("bar-A"),
  insightTitle: $id("insight-title"),
  insightText: $id("insight-text"),
  deltaR: $id("delta-R"),
  deltaT: $id("delta-T"),
  gammaMag: $id("gamma-mag"),
  gammaPhase: $id("gamma-phase"),
  tauMag: $id("tau-mag"),
  tauPhase: $id("tau-phase"),
  epsEff: $id("eps-eff"),
  nEff: $id("n-eff"),
  thetaWall: $id("theta-wall"),
  brewster: $id("brewster"),
  attenuation: $id("attenuation"),
  opticalThickness: $id("optical-thickness"),
  tos: $id("tos"),
  ros: $id("ros"),
  chartCanvas: $id("analysis-chart"),
  chartTitle: $id("chart-title"),
  chartSubtitle: $id("chart-subtitle"),
  chartLegend: $id("chart-legend"),
  chartNote: $id("chart-note"),
  chartCsv: $id("chart-csv"),
  chartPng: $id("chart-png"),
  analysisTitle: $id("analysis-title"),
  analysisText: $id("analysis-text"),
  analysisList: $id("analysis-list"),
  referenceTable: $id("reference-table"),
  validationSummary: $id("validation-summary"),
  validationSubtitle: $id("validation-subtitle"),
  validationList: $id("validation-list"),
  energyError: $id("energy-error"),
  airyError: $id("airy-error"),
  benchmarkGrid: $id("benchmark-grid"),
  githubLink: $id("github-link"),
  repoLink: $id("repo-link"),
  authorLine: $id("author-line"),
  toast: $id("toast"),
};

/* --------------------------------------------------------------------------
   Calculs
   -------------------------------------------------------------------------- */

function computeAt(fraction = state.bubbleFraction) {
  const epsWall = maxwellGarnett(EPS_MATRIX, EPS_AIR, fraction);
  const slab = computeSlab({
    frequencyHz: state.frequencyHz,
    thetaDeg: state.thetaDeg,
    polarization: state.polarization,
    epsWall,
    thicknessM: WALL.thicknessM,
  });
  return { epsWall, slab };
}

function refresh({ updateHistory = true } = {}) {
  const computed = computeAt();
  model = computed.slab;
  const baseline = computeAt(0);
  baselineModel = baseline.slab;

  brewster = brewsterAngle({
    frequencyHz: state.frequencyHz,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    fraction: state.bubbleFraction,
    thicknessM: WALL.thicknessM,
  });

  validation = validateModel({
    frequencyHz: state.frequencyHz,
    thetaDeg: state.thetaDeg,
    polarization: state.polarization,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
  });

  profile =
    state.chartTab === "field"
      ? electricFieldProfile({
          frequencyHz: state.frequencyHz,
          thetaDeg: state.thetaDeg,
          polarization: state.polarization,
          epsWall: computed.epsWall,
          thicknessM: WALL.thicknessM,
        })
      : null;

  syncControls();
  updateReadouts();
  updateInsight();
  updateValidation();
  updateChart();
  updatePresentationHud();
  prepareBubbles();
  drawWaveScene();
  updateUrl(updateHistory);
}

function scheduleRefresh(options) {
  if (updateQueued) return;
  updateQueued = true;
  window.requestAnimationFrame(() => {
    updateQueued = false;
    refresh(options);
  });
}

/* --------------------------------------------------------------------------
   Contrôles et lectures numériques
   -------------------------------------------------------------------------- */

function setText(id, value) {
  const node = $id(id);
  if (node) node.textContent = value;
}

function setHTML(id, value) {
  const node = $id(id);
  if (node) node.innerHTML = value;
}

function setFill(slider) {
  if (!slider) return;
  const min = Number(slider.min);
  const max = Number(slider.max);
  const value = Number(slider.value);
  const ratio = (value - min) / (max - min || 1);
  slider.style.setProperty("--fill", `${(clamp(ratio, 0, 1) * 100).toFixed(2)}%`);
}

function syncControls() {
  if (dom.bubbleSlider) {
    dom.bubbleSlider.value = String(state.bubbleFraction);
    setFill(dom.bubbleSlider);
  }
  if (dom.frequencySlider) {
    dom.frequencySlider.value = String(state.frequencyHz / 1e9);
    setFill(dom.frequencySlider);
  }
  if (dom.angleSlider) {
    dom.angleSlider.value = String(state.thetaDeg);
    setFill(dom.angleSlider);
  }

  setText("bubble-value", fmtPct(state.bubbleFraction));
  setText("frequency-value", fmtGHz(state.frequencyHz));
  setText("angle-value", fmtDeg(state.thetaDeg));

  $$("[data-pol]").forEach((button) => {
    const active = button.dataset.pol === state.polarization;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (dom.presetRow) {
    $$(".preset", dom.presetRow).forEach((button) => {
      const active = Math.abs(Number(button.dataset.value) - state.bubbleFraction) < 1e-9;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
}

function renderPresets() {
  if (!dom.presetRow) return;
  dom.presetRow.innerHTML = "";
  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.value = String(preset.value);
    button.textContent = preset.label;
    button.title = preset.hint;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.bubbleFraction = preset.value;
      scheduleRefresh();
    });
    dom.presetRow.append(button);
  }
}

function updateReadouts() {
  if (!model) return;
  const s = model;
  const Rs = fmtPct(s.R);
  const Ts = fmtPct(s.T);
  const As = fmtPct(Math.max(0, s.absorption));

  setText("result-R", Rs);
  setText("result-T", Ts);
  setText("result-A", As);
  setText("hero-R", Rs);
  setText("hero-T", Ts);
  setText("hero-A", As);
  setText("hero-float-R", Rs);
  setText("hero-float-T", Ts);
  setText("present-R", Rs);
  setText("present-T", Ts);
  setText("present-A", As);

  if (dom.barR) dom.barR.style.width = `${clamp(s.R, 0, 1) * 100}%`;
  if (dom.barT) dom.barT.style.width = `${clamp(s.T, 0, 1) * 100}%`;
  if (dom.barA) dom.barA.style.width = `${clamp(Math.max(0, s.absorption), 0, 1) * 100}%`;

  setText("gamma-mag", nf(cx.abs(s.Gamma), 3));
  setText("gamma-phase", fmtPhase(s.reflectionPhaseDeg));
  setText("tau-mag", nf(cx.abs(s.tau), 3));
  setText("tau-phase", fmtPhase(s.transmissionPhaseDeg));
  setText("eps-eff", fmtComplex(s.epsWall));
  setText("n-eff", fmtComplex(s.nWall));
  setText("theta-wall", fmtDeg(s.thetaWallDeg, 1));
  setText("brewster", fmtDeg(brewster.thetaDeg, 1));
  setText("attenuation", `${nf(s.attenuationDb, 2)} dB`);
  setText("optical-thickness", `${nf(s.opticalThickness, 2)} λ`);
  setText("tos", nf(cx.abs(s.Gamma), 3));
  setText("ros", Number.isFinite(s.vswr) ? nf(s.vswr, 2) : "∞");

  if (dom.vizBadge) {
    dom.vizBadge.textContent = `Γ = ${nf(cx.abs(s.Gamma), 2)} ∠ ${fmtPhase(s.reflectionPhaseDeg)}`;
  }

  if (dom.vizCaption) {
    dom.vizCaption.textContent =
      `À ${fmtPct(state.bubbleFraction)} de bulles, ${fmtGHz(state.frequencyHz)} et ${fmtDeg(state.thetaDeg)} : ` +
      `${Rs} de l'énergie est réfléchie, ${Ts} traverse le mur. ` +
      `Le champ dans la paroi est atténué de ${nf(s.attenuationDb, 2)} dB.`;
  }
}

function updateInsight() {
  if (!model || !baselineModel) return;
  const deltaR = (model.R - baselineModel.R) * 100;
  const deltaT = (model.T - baselineModel.T) * 100;

  if (dom.deltaR) dom.deltaR.textContent = `R ${fmtSignedPoints(deltaR)}`;
  if (dom.deltaT) dom.deltaT.textContent = `T ${fmtSignedPoints(deltaT)}`;

  const fraction = fmtPct(state.bubbleFraction);
  const baseR = fmtPct(baselineModel.R);
  const currentR = fmtPct(model.R);
  const currentT = fmtPct(model.T);
  const epsNow = fmtComplex(model.epsWall, 1);

  if (state.bubbleFraction < 0.0005) {
    setText("insight-title", "Sans bulles : le mur plein sert de référence.");
    setText(
      "insight-text",
      `À ${fmtGHz(state.frequencyHz)} et ${fmtDeg(state.thetaDeg)}, le mur plein réfléchit ${baseR} ` +
        `et transmet ${currentT}. La porosité vaut 0 % : l'impédance du béton est encore éloignée de celle de l'air.`,
    );
    return;
  }

  if (model.R < baselineModel.R - 0.005) {
    setText("insight-title", "Les bulles rapprochent le mur de l'air.");
    setText(
      "insight-text",
      `En passant de 0 à ${fraction} de bulles, R baisse de ${baseR} à ${currentR} et T monte à ${currentT}. ` +
        `La permittivité effective descend à ${epsNow} : l'adaptation d'impédance avec l'air s'améliore, ` +
        `donc une plus grande part de l'onde traverse la paroi.`,
    );
    return;
  }

  if (model.R > baselineModel.R + 0.005) {
    setText("insight-title", "À ce point de fonctionnement, les bulles augmentent la réflexion.");
    setText(
      "insight-text",
      `Avec ${fraction} de bulles, R passe de ${baseR} à ${currentR} et T à ${currentT}. ` +
        `L'effet des réflexions internes de la lame peut dominer localement : la porosité ne se traduit pas ` +
        `toujours par une baisse immédiate de la réflexion.`,
    );
    return;
  }

  setText("insight-title", "Un effet discret à ce point de fonctionnement.");
  setText(
    "insight-text",
    `Avec ${fraction} de bulles, R reste proche de la référence sans bulles (${baseR}) et T vaut ${currentT}. ` +
      `La fréquence et l'angle choisis placent le mur dans une zone où la variation de permittivité a peu d'effet visible.`,
  );
}

/* --------------------------------------------------------------------------
   Plus de contenu dans la partie suivante du module.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Graphiques, analyse et validation
   -------------------------------------------------------------------------- */

const SERIES_RTA = [
  { key: "R", label: "R — réflexion" },
  { key: "T", label: "T — transmission" },
  { key: "A", label: "A — absorption" },
];

const LEGEND_RTA = `
  <span><i class="legend-line legend-line--R"></i> R — réflexion</span>
  <span><i class="legend-line legend-line--T"></i> T — transmission</span>
  <span><i class="legend-line legend-line--A"></i> A — absorption</span>
`;

function rowNearest(rows, target, key = "x") {
  return rows.reduce(
    (best, row) => (Math.abs(row[key] - target) < Math.abs(best[key] - target) ? row : best),
    rows[0],
  );
}

function buildDensityChart() {
  const rows = sweepDensity({
    frequencyHz: state.frequencyHz,
    thetaDeg: state.thetaDeg,
    polarization: state.polarization,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
    maxFraction: RANGES.bubbleFraction.max,
    points: 151,
  });
  const r0 = rows[0];
  const r25 = rowNearest(rows, 0.25);
  const r50 = rows[rows.length - 1];
  const drop = (r0.R - r50.R) * 100;
  const delta = Math.abs(drop) < 0.5 ? "reste presque stable" : drop > 0 ? "recule" : "progresse";

  const title =
    drop > 0.5
      ? `La réflexion recule de ${nf(drop, 1)} points entre 0 et 50 % de bulles.`
      : drop < -0.5
        ? "À ce point de fonctionnement, la réflexion progresse avec la porosité."
        : "La porosité a peu d'effet sur la réflexion ici.";

  const text =
    `À ${fmtGHz(state.frequencyHz)} et ${fmtDeg(state.thetaDeg)}, R ${delta} de ${fmtPct(r0.R)} ` +
    `(mur plein) à ${fmtPct(r50.R)} (50 % de bulles), tandis que T passe de ${fmtPct(r0.T)} à ${fmtPct(r50.T)}. ` +
    `La permittivité effective se rapproche de celle de l'air, ce qui réduit le désaccord d'impédance.`;

  return {
    rows,
    series: SERIES_RTA,
    title,
    subtitle: `En fonction de la porosité volumique, à ${fmtGHz(state.frequencyHz)} et ${fmtDeg(state.thetaDeg)}.`,
    note:
      "Le repère vertical indique la porosité courante. La courbe est calculée avec la matrice de transfert complète, " +
      "pas avec une simple interface de Fresnel.",
    legend: LEGEND_RTA,
    xMin: 0,
    xMax: 0.5,
    yMin: 0,
    yMax: 1,
    xLabel: "porosité volumique φ",
    yLabel: "coefficient",
    xTickFormatter: (value) => `${Math.round(value * 100)} %`,
    yTickFormatter: (value) => `${Math.round(value * 100)} %`,
    tooltipTitle: (row) => `φ = ${fmtPct(row.x)}`,
    tooltipValue: (value) => fmtPct(value),
    marker: {
      x: state.bubbleFraction,
      values: { R: model.R, T: model.T, A: model.absorption },
    },
    csvHeader: ["porosite_pourcent", "R", "T", "A"],
    csvRows: rows.map((row) => [row.x * 100, row.R, row.T, row.A]),
    filename: "bubblewave-porosite",
    chartLabel: "R, T et A en fonction de la porosité",
    analysis: (() => {
      const list = [
        `<li><strong>Mur plein :</strong> R = ${fmtPct(r0.R)}, T = ${fmtPct(r0.T)}</li>`,
        `<li><strong>À 25 % de bulles :</strong> R = ${fmtPct(r25.R)}, T = ${fmtPct(r25.T)}</li>`,
        `<li><strong>À 50 % de bulles :</strong> R = ${fmtPct(r50.R)}, T = ${fmtPct(r50.T)}</li>`,
        `<li><strong>Absorption :</strong> entre ${fmtPct(Math.min(r0.A, r25.A, r50.A))} et ${fmtPct(Math.max(r0.A, r25.A, r50.A))}</li>`,
      ];
      return { title: "La porosité rapproche le mur de l'air.", text, list };
    })(),
  };
}

function buildFrequencyChart() {
  const rows = sweepFrequency({
    fraction: state.bubbleFraction,
    frequencyMinHz: RANGES.frequencyHz.min,
    frequencyMaxHz: RANGES.frequencyHz.max,
    thetaDeg: state.thetaDeg,
    polarization: state.polarization,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
    points: 241,
  });
  const minRow = rows.reduce((best, row) => (row.R < best.R ? row : best), rows[0]);
  const maxRow = rows.reduce((best, row) => (row.R > best.R ? row : best), rows[0]);
  const spread = (maxRow.R - minRow.R) * 100;
  const title =
    spread > 8
      ? "La fréquence déplace fortement le point de fonctionnement."
      : "Une réponse relativement stable en fréquence.";

  const text =
    `Entre 0,5 et 6 GHz, R varie de ${fmtPct(minRow.R)} à ${fmtPct(maxRow.R)}. ` +
    `Les ondulations observées viennent des réflexions internes de la lame : le mur se comporte comme une cavité de Fabry-Pérot. ` +
    `La fréquence courante est ${fmtGHz(state.frequencyHz)}.`;

  return {
    rows,
    series: SERIES_RTA,
    title,
    subtitle: `En fonction de la fréquence, à ${fmtPct(state.bubbleFraction)} de bulles et ${fmtDeg(state.thetaDeg)}.`,
    note:
      "Le repère vertical indique la fréquence courante. Un extremum local n'est pas une erreur numérique : " +
      "il correspond à un accord ou désaccord de phase dans l'épaisseur du mur.",
    legend: LEGEND_RTA,
    xMin: 0.5,
    xMax: 6,
    yMin: 0,
    yMax: 1,
    xLabel: "fréquence (GHz)",
    yLabel: "coefficient",
    xTickFormatter: (value) => nf(value, 1),
    yTickFormatter: (value) => `${Math.round(value * 100)} %`,
    tooltipTitle: (row) => `f = ${fmtFrequencyFromGHz(row.x)}`,
    tooltipValue: (value) => fmtPct(value),
    marker: {
      x: state.frequencyHz / 1e9,
      values: { R: model.R, T: model.T, A: model.absorption },
    },
    csvHeader: ["frequence_GHz", "R", "T", "A"],
    csvRows: rows.map((row) => [row.x, row.R, row.T, row.A]),
    filename: "bubblewave-frequence",
    chartLabel: "R, T et A en fonction de la fréquence",
    analysis: (() => {
      const list = [
        `<li><strong>R minimal :</strong> ${fmtPct(minRow.R)} à ${fmtFrequencyFromGHz(minRow.x)}</li>`,
        `<li><strong>R maximal :</strong> ${fmtPct(maxRow.R)} à ${fmtFrequencyFromGHz(maxRow.x)}</li>`,
        `<li><strong>Point courant :</strong> ${fmtGHz(state.frequencyHz)} → R = ${fmtPct(model.R)}, T = ${fmtPct(model.T)}</li>`,
      ];
      return { title: "Interférences dans l'épaisseur du mur.", text, list };
    })(),
  };
}

function buildAngleChart() {
  const rows = sweepAngle({
    fraction: state.bubbleFraction,
    frequencyHz: state.frequencyHz,
    polarization: state.polarization,
    thetaMinDeg: 0,
    thetaMaxDeg: 80,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
    points: 161,
  });
  const teRows = sweepAngle({
    fraction: state.bubbleFraction,
    frequencyHz: state.frequencyHz,
    polarization: "TE",
    thetaMinDeg: 0,
    thetaMaxDeg: 80,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
    points: 81,
  });
  const tmRows = sweepAngle({
    fraction: state.bubbleFraction,
    frequencyHz: state.frequencyHz,
    polarization: "TM",
    thetaMinDeg: 0,
    thetaMaxDeg: 80,
    epsMatrix: EPS_MATRIX,
    epsInclusion: EPS_AIR,
    thicknessM: WALL.thicknessM,
    points: 161,
  });
  const tmMin = tmRows.reduce((best, row) => (row.R < best.R ? row : best), tmRows[0]);
  const te80 = teRows[teRows.length - 1];
  const te0 = teRows[0];
  const title =
    state.polarization === "TM"
      ? `TM : la réflexion passe par un minimum vers ${fmtDeg(tmMin.x, 0)}.`
      : "En TE, la réflexion augmente avec l'angle d'incidence.";

  const text =
    `En polarisation TE, R passe de ${fmtPct(te0.R)} à ${fmtPct(te80.R)} entre 0° et 80°. ` +
    `En TM, le minimum de réflexion est atteint vers ${fmtDeg(tmMin.x, 0)} : c'est la signature de l'angle de Brewster. ` +
    `Le minimum n'est pas exactement nul ici car le béton est légèrement dissipatif.`;

  return {
    rows,
    series: SERIES_RTA,
    title,
    subtitle: `En fonction de l'angle d'incidence, à ${fmtPct(state.bubbleFraction)} et ${fmtGHz(state.frequencyHz)}, polarisation ${state.polarization}.`,
    note:
      "Le repère vertical indique l'angle courant. En TM, le minimum de R correspond à l'angle de Brewster du milieu effectif ; " +
      "le calcul TMM en tient compte à chaque interface.",
    legend: LEGEND_RTA,
    xMin: 0,
    xMax: 80,
    yMin: 0,
    yMax: 1,
    xLabel: "angle d'incidence θ (°)",
    yLabel: "coefficient",
    xTickFormatter: (value) => `${Math.round(value)}°`,
    yTickFormatter: (value) => `${Math.round(value * 100)} %`,
    tooltipTitle: (row) => `θ = ${fmtDeg(row.x, 0)}`,
    tooltipValue: (value) => fmtPct(value),
    marker: {
      x: state.thetaDeg,
      values: { R: model.R, T: model.T, A: model.absorption },
    },
    csvHeader: ["angle_deg", "R", "T", "A"],
    csvRows: rows.map((row) => [row.x, row.R, row.T, row.A]),
    filename: "bubblewave-angle",
    chartLabel: "R, T et A en fonction de l'angle d'incidence",
    analysis: (() => {
      const list = [
        `<li><strong>TE :</strong> R = ${fmtPct(te0.R)} à 0°, ${fmtPct(te80.R)} à 80°</li>`,
        `<li><strong>TM :</strong> minimum R = ${fmtPct(tmMin.R)} vers ${fmtDeg(tmMin.x, 0)}</li>`,
        `<li><strong>Polarisation ${state.polarization} :</strong> à ${fmtDeg(state.thetaDeg)} → R = ${fmtPct(model.R)}</li>`,
      ];
      return { title: "L'angle de Brewster en polarisation TM.", text, list };
    })(),
  };
}

function buildFieldChart() {
  if (!profile) {
    const computed = computeAt();
    profile = electricFieldProfile({
      frequencyHz: state.frequencyHz,
      thetaDeg: state.thetaDeg,
      polarization: state.polarization,
      epsWall: computed.epsWall,
      thicknessM: WALL.thicknessM,
    });
  }

  const wallThicknessMm = WALL.thicknessM * 1000;
  const rows = profile.points.map((point) => ({
    x: point.z * 1000,
    mag: point.mag,
  }));
  const inside = profile.points.filter((point) => point.region === "wall");
  const maxPoint = inside.reduce((best, point) => (point.mag > best.mag ? point : best), inside[0]);
  const minPoint = inside.reduce((best, point) => (point.mag < best.mag ? point : best), inside[0]);
  const entrance = inside[0];
  const exit = inside[inside.length - 1];
  const contrast = maxPoint.mag / Math.max(minPoint.mag, 1e-9);
  const peaksInside = maxPoint.z > WALL.thicknessM * 0.12;
  const title = peaksInside ? "Le champ interfère dans la paroi." : "Le champ s'atténue dans la paroi.";
  const maxMag = Math.max(...rows.map((row) => row.mag), 1);
  const yMax = Math.max(1.2, Math.ceil(maxMag * 10) / 10);

  const text =
    `Le champ est normalisé à l'onde incidente. À l'entrée du mur, |E| ≈ ${nf(entrance.mag, 2)} ; ` +
    `à la sortie, |E| ≈ ${nf(exit.mag, 2)}. Le maximum interne vaut ${nf(maxPoint.mag, 2)} à ` +
    `${nf(maxPoint.z * 1000, 1)} mm, ce qui traduit la superposition des ondes aller et retour.`;

  return {
    rows,
    series: [{ key: "mag", label: "|E(z)| / |E_i|", fill: true, color: { light: "#168fbe", dark: "#63dcff" } }],
    title,
    subtitle: `Profil du champ total à ${fmtPct(state.bubbleFraction)}, ${fmtGHz(state.frequencyHz)}, ${fmtDeg(state.thetaDeg)}, polarisation ${state.polarization}.`,
    note:
      `La bande claire représente le mur (0 → ${nf(wallThicknessMm, 0)} mm). L'échelle verticale s'adapte au maximum du profil ; ` +
      "le champ est calculé sur une coupe perpendiculaire au mur.",
    legend: `<span><i class="legend-line legend-line--field"></i> |E(z)| / |E_i| — champ total</span><span class="legend-band"></span> mur`,
    xMin: rows[0].x,
    xMax: rows[rows.length - 1].x,
    yMin: 0,
    yMax,
    xLabel: "z (mm) · 0 = face d'entrée",
    yLabel: "|E| / |E_i|",
    xTickFormatter: (value) => nf(value, 0),
    yTickFormatter: (value) => nf(value, 1),
    tooltipTitle: (row) => `z = ${nf(row.x, 1)} mm`,
    tooltipValue: (value) => nf(value, 3),
    bands: [{ x0: 0, x1: wallThicknessMm, label: "MUR", color: "rgba(35, 199, 232, 0.10)" }],
    csvHeader: ["z_mm", "E_sur_Ei"],
    csvRows: rows.map((row) => [row.x, row.mag]),
    filename: "bubblewave-profil-champ",
    chartLabel: "Profil du champ électrique dans et autour du mur",
    analysis: (() => {
      const list = [
        `<li><strong>Entrée :</strong> |E| / |E_i| = ${nf(entrance.mag, 3)}</li>`,
        `<li><strong>Maximum interne :</strong> ${nf(maxPoint.mag, 3)} à z = ${nf(maxPoint.z * 1000, 1)} mm</li>`,
        `<li><strong>Minimum interne :</strong> ${nf(minPoint.mag, 3)} à z = ${nf(minPoint.z * 1000, 1)} mm</li>`,
        `<li><strong>Contraste max/min :</strong> ${nf(contrast, 2)}</li>`,
      ];
      return { title: "Des ondes stationnaires dans la paroi.", text, list };
    })(),
  };
}

function buildChartInfo() {
  switch (state.chartTab) {
    case "frequency":
      return buildFrequencyChart();
    case "angle":
      return buildAngleChart();
    case "field":
      return buildFieldChart();
    case "density":
    default:
      return buildDensityChart();
  }
}

function updateChartTabUI() {
  $$(".chart-tabs button").forEach((button) => {
    const active = button.dataset.chart === state.chartTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    button.setAttribute("aria-controls", "analysis-chart");
  });
}

function updateReferenceTable() {
  if (!dom.referenceTable || !model || !baselineModel) return;
  const rows = [
    ["R sans bulles", fmtPct(baselineModel.R)],
    ["R actuel", fmtPct(model.R)],
    ["T sans bulles", fmtPct(baselineModel.T)],
    ["T actuel", fmtPct(model.T)],
    ["A sans bulles", fmtPct(baselineModel.absorption)],
    ["A actuel", fmtPct(model.absorption)],
  ];
  dom.referenceTable.innerHTML = rows
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function updateChart() {
  if (!model) return;
  updateChartTabUI();
  const info = buildChartInfo();
  chartInfo = info;

  if (dom.chartTitle) dom.chartTitle.textContent = info.title;
  if (dom.chartSubtitle) dom.chartSubtitle.textContent = info.subtitle;
  if (dom.chartLegend) dom.chartLegend.innerHTML = info.legend;
  if (dom.chartNote) dom.chartNote.textContent = info.note;

  if (dom.analysisTitle) dom.analysisTitle.textContent = info.analysis.title;
  if (dom.analysisText) dom.analysisText.textContent = info.analysis.text;
  if (dom.analysisList) dom.analysisList.innerHTML = info.analysis.list.join("");

  if (chart && dom.chartCanvas) {
    dom.chartCanvas.setAttribute("aria-label", info.chartLabel);
    chart.setData({
      rows: info.rows,
      series: info.series,
      xMin: info.xMin,
      xMax: info.xMax,
      yMin: info.yMin,
      yMax: info.yMax,
      xLabel: info.xLabel,
      yLabel: info.yLabel,
      xTickFormatter: info.xTickFormatter,
      yTickFormatter: info.yTickFormatter,
      tooltipTitle: info.tooltipTitle,
      tooltipValue: info.tooltipValue,
      marker: info.marker,
      bands: info.bands,
    });
  }

  updateReferenceTable();
}

function updateValidation() {
  if (!validation) return;
  const passed = validation.checks.filter((check) => check.pass).length;
  const total = validation.checks.length;
  const badge = dom.validationSummary ? $(".validation-badge", dom.validationSummary) : null;

  if (badge) {
    badge.textContent = validation.allPass ? "✓" : "!";
    badge.classList.toggle("fail", !validation.allPass);
  }
  if (dom.validationSubtitle) {
    dom.validationSubtitle.textContent = validation.allPass
      ? `${passed} / ${total} contrôles réussis · calcul en temps réel`
      : `${total - passed} contrôle(s) en échec · vérifier les paramètres`;
  }

  if (dom.validationList) {
    dom.validationList.innerHTML = validation.checks
      .map(
        (check) => `
          <div class="validation-row${check.pass ? "" : " fail"}">
            <span class="validation-icon" aria-hidden="true">${check.pass ? "✓" : "!"}</span>
            <div class="validation-row-text">
              <strong>${check.label}</strong>
              <span>${check.detail}</span>
            </div>
            <span class="validation-value">${fmtSci(check.value)}</span>
          </div>`,
      )
      .join("");
  }

  setText("energy-error", fmtSci(validation.maxEnergyError));
  setText("airy-error", fmtSci(validation.maxAiryError));
}

let benchmarkModel = null;

function updateBenchmark() {
  if (!dom.benchmarkGrid) return;
  if (!benchmarkModel) {
    const epsDefault = maxwellGarnett(EPS_MATRIX, EPS_AIR, DEFAULTS.bubbleFraction);
    benchmarkModel = computeSlab({
      frequencyHz: DEFAULTS.frequencyHz,
      thetaDeg: 0,
      polarization: "TE",
      epsWall: epsDefault,
      thicknessM: WALL.thicknessM,
    });
  }
  const rows = [
    ["R", fmtPct(benchmarkModel.R)],
    ["T", fmtPct(benchmarkModel.T)],
    ["A", fmtPct(benchmarkModel.absorption)],
    ["|Γ|", nf(cx.abs(benchmarkModel.Gamma), 3)],
  ];
  dom.benchmarkGrid.innerHTML = rows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function updatePresentationHud() {
  if (!model) return;
  setText("present-R", fmtPct(model.R));
  setText("present-T", fmtPct(model.T));
  setText("present-A", fmtPct(Math.max(0, model.absorption)));
}

function updateUrl(force = true) {
  if (!force) return;
  const url = new URL(window.location.href);
  url.searchParams.set("porosite", (state.bubbleFraction * 100).toFixed(1));
  url.searchParams.set("frequence", (state.frequencyHz / 1e9).toFixed(2));
  url.searchParams.set("angle", String(Math.round(state.thetaDeg)));
  url.searchParams.set("pol", state.polarization);
  url.searchParams.set("vue", state.chartTab);
  url.searchParams.delete("phi");
  try {
    window.history.replaceState(null, "", url);
  } catch {
    // Certains navigateurs bloquent replaceState sur file://.
  }
}

/* --------------------------------------------------------------------------
   Animation de la coupe
   -------------------------------------------------------------------------- */

const wave = {
  canvas: dom.waveCanvas,
  wrap: dom.waveCanvas ? dom.waveCanvas.parentElement : null,
  ctx: null,
  width: 0,
  height: 0,
  bubbles: [],
  lastPhi: -1,
  clock: 0,
  lastTs: 0,
  visible: true,
  loopStarted: false,
};

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function prepareBubbles() {
  const phi = state.bubbleFraction;
  if (Math.abs(phi - wave.lastPhi) < 1e-9) return;
  wave.lastPhi = phi;
  wave.bubbles = [];
  if (phi <= 0) return;

  const random = seededRandom(9137 + Math.round(phi * 100000));
  const count = Math.round(phi * 170);
  for (let index = 0; index < count; index += 1) {
    wave.bubbles.push({
      x: 0.06 + random() * 0.88,
      y: 0.06 + random() * 0.88,
      radius: 0.9 + random() * 3.9,
      alpha: 0.2 + random() * 0.48,
      speed: 0.25 + random() * 0.7,
      phase: random() * Math.PI * 2,
    });
  }
}

function drawSine(ctx, { x0, x1, centerY, ampStart, ampEnd = ampStart, lambda, direction, phaseOffset = 0, color, alpha = 1, width = 2.2, dash = [] }) {
  if (x1 - x0 < 3) return;
  const omega = Math.PI * 2 * 0.62;
  const step = 2;
  ctx.save();
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    const progress = (x - x0) / (x1 - x0);
    const amplitude = ampStart + (ampEnd - ampStart) * progress;
    const phase =
      direction === "left"
        ? (Math.PI * 2 * x) / lambda + omega * wave.clock + phaseOffset
        : (Math.PI * 2 * x) / lambda - omega * wave.clock + phaseOffset;
    const y = centerY + Math.sin(phase) * amplitude;
    if (x === x0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.restore();
}

function drawPulse(ctx, { x0, x1, centerY, amp, lambda, direction, phaseOffset = 0, color, offset = 0 }) {
  const omega = Math.PI * 2 * 0.62;
  const progress = ((wave.clock * 0.19 + offset) % 1 + 1) % 1;
  const x = direction === "left" ? x1 - (x1 - x0) * progress : x0 + (x1 - x0) * progress;
  const phase =
    direction === "left"
      ? (Math.PI * 2 * x) / lambda + omega * wave.clock + phaseOffset
      : (Math.PI * 2 * x) / lambda - omega * wave.clock + phaseOffset;
  const y = centerY + Math.sin(phase) * amp;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWaveScene() {
  const ctx = wave.ctx;
  if (!ctx || !model || !wave.width || !wave.height) return;

  const W = wave.width;
  const H = wave.height;
  const s = model;
  const phi = state.bubbleFraction;

  const pad = Math.max(14, W * 0.022);
  const wallWidth = clamp(W * 0.13, 64, 116);
  const wallX = W * 0.5 - wallWidth / 2;
  const wallR = wallX + wallWidth;
  const panelTop = Math.max(36, H * 0.12);
  const panelBottom = H - Math.max(36, H * 0.12);
  const panelHeight = panelBottom - panelTop;
  const baseAmp = clamp(panelHeight * 0.062, 9, 21);

  const laneIncident = panelTop + panelHeight * 0.18;
  const laneReflected = panelTop + panelHeight * 0.4;
  const laneWall = panelTop + panelHeight * 0.62;
  const laneTransmitted = panelTop + panelHeight * 0.84;

  const baseLambda = clamp(Math.min(W * 0.34, 235) * (1e9 / state.frequencyHz) ** 0.32, 62, 250);
  const wallLambda = clamp(baseLambda / Math.max(1.2, s.nReal), 24, 170);
  const gammaAbs = cx.abs(s.Gamma);
  const amplitudeReflected = baseAmp * gammaAbs;
  const amplitudeTransmitted = baseAmp * Math.sqrt(Math.max(0, s.T));
  const amplitudeWallStart = baseAmp * clamp(1 + gammaAbs * 0.45, 1, 1.5);
  const gammaPhase = (s.reflectionPhaseDeg * Math.PI) / 180;
  const tauPhase = (s.transmissionPhaseDeg * Math.PI) / 180;

  ctx.clearRect(0, 0, W, H);
  const background = ctx.createLinearGradient(0, 0, 0, H);
  background.addColorStop(0, "#08253d");
  background.addColorStop(0.48, "#061b2f");
  background.addColorStop(1, "#04101c");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  const halo = ctx.createRadialGradient(W * 0.5, H * 0.52, 10, W * 0.5, H * 0.52, W * 0.42);
  halo.addColorStop(0, "rgba(35, 199, 232, 0.13)");
  halo.addColorStop(0.5, "rgba(35, 199, 232, 0.04)");
  halo.addColorStop(1, "rgba(35, 199, 232, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(127, 240, 255, 0.09)";
  for (let x = 20; x < W; x += 27) {
    for (let y = 20; y < H; y += 27) {
      ctx.beginPath();
      ctx.arc(x, y, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(158, 223, 240, 0.58)";
  ctx.font = "600 9.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("AIR", pad + 2, 24);
  ctx.textAlign = "right";
  ctx.fillText("AIR", W - pad - 2, 24);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(189, 248, 255, 0.78)";
  ctx.fillText("MUR À BULLES", W / 2, 24);

  // Panneau du mur, avec un dégradé et un liseré lumineux.
  ctx.save();
  roundedRectPath(ctx, wallX, panelTop, wallWidth, panelHeight, 14);
  const wallGradient = ctx.createLinearGradient(wallX, 0, wallR, 0);
  wallGradient.addColorStop(0, "rgba(20, 64, 99, 0.92)");
  wallGradient.addColorStop(0.5, "rgba(15, 55, 89, 0.96)");
  wallGradient.addColorStop(1, "rgba(8, 37, 63, 0.94)");
  ctx.fillStyle = wallGradient;
  ctx.shadowColor = "rgba(35, 199, 232, 0.22)";
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();

  const innerGradient = ctx.createLinearGradient(0, panelTop, 0, panelBottom);
  innerGradient.addColorStop(0, "rgba(127, 240, 255, 0.08)");
  innerGradient.addColorStop(0.5, "rgba(127, 240, 255, 0)");
  innerGradient.addColorStop(1, "rgba(55, 214, 178, 0.06)");
  ctx.fillStyle = innerGradient;
  ctx.fillRect(wallX, panelTop, wallWidth, panelHeight);

  for (const bubble of wave.bubbles) {
    const bob = Math.sin(wave.clock * bubble.speed + bubble.phase) * 1.4;
    const x = wallX + bubble.x * wallWidth;
    const y = panelTop + bubble.y * panelHeight + bob;
    ctx.beginPath();
    ctx.arc(x, y, bubble.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(127, 240, 255, ${bubble.alpha})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    if (bubble.radius > 2.2) {
      ctx.beginPath();
      ctx.arc(x - bubble.radius * 0.28, y - bubble.radius * 0.28, bubble.radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(233, 248, 255, ${bubble.alpha * 0.7})`;
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(189, 248, 255, 0.52)";
  ctx.font = "600 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`φ = ${fmtPct(phi)}`, W / 2, panelTop + 17);
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, wallX, panelTop, wallWidth, panelHeight, 14);
  ctx.strokeStyle = "rgba(127, 240, 255, 0.32)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(127, 240, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 7]);
  ctx.beginPath();
  ctx.moveTo(wallX, panelTop + 26);
  ctx.lineTo(wallX, panelBottom - 12);
  ctx.moveTo(wallR, panelTop + 26);
  ctx.lineTo(wallR, panelBottom - 12);
  ctx.stroke();
  ctx.restore();

  // Onde incidente (vers la droite).
  drawSine(ctx, {
    x0: pad + 2,
    x1: wallX - 3,
    centerY: laneIncident,
    ampStart: baseAmp,
    lambda: baseLambda,
    direction: "right",
    color: "#8beeff",
    alpha: 0.95,
    width: 2.4,
  });
  drawPulse(ctx, {
    x0: pad + 2,
    x1: wallX - 3,
    centerY: laneIncident,
    amp: baseAmp,
    lambda: baseLambda,
    direction: "right",
    color: "#c8fbff",
    offset: 0.12,
  });
  drawPulse(ctx, {
    x0: pad + 2,
    x1: wallX - 3,
    centerY: laneIncident,
    amp: baseAmp,
    lambda: baseLambda,
    direction: "right",
    color: "#8beeff",
    offset: 0.58,
  });

  // Onde réfléchie (vers la gauche), amplitude proportionnelle à |Γ|.
  drawSine(ctx, {
    x0: pad + 2,
    x1: wallX - 3,
    centerY: laneReflected,
    ampStart: amplitudeReflected,
    lambda: baseLambda,
    direction: "left",
    phaseOffset: gammaPhase,
    color: "#ff9c90",
    alpha: 0.5 + 0.48 * Math.sqrt(gammaAbs),
    width: 2.1,
    dash: [5, 9],
  });
  drawPulse(ctx, {
    x0: pad + 2,
    x1: wallX - 3,
    centerY: laneReflected,
    amp: amplitudeReflected,
    lambda: baseLambda,
    direction: "left",
    phaseOffset: gammaPhase,
    color: "#ffc0b8",
    offset: 0.35,
  });

  // Champ dans la paroi : longueur d'onde réduite et amplitude décroissante.
  drawSine(ctx, {
    x0: wallX + 3,
    x1: wallR - 3,
    centerY: laneWall,
    ampStart: amplitudeWallStart,
    ampEnd: amplitudeTransmitted,
    lambda: wallLambda,
    direction: "right",
    phaseOffset: tauPhase,
    color: "#e6fbff",
    alpha: 0.88,
    width: 2.2,
  });

  // Onde transmise (vers la droite), amplitude proportionnelle à √T.
  drawSine(ctx, {
    x0: wallR + 3,
    x1: W - pad - 2,
    centerY: laneTransmitted,
    ampStart: amplitudeTransmitted,
    lambda: baseLambda,
    direction: "right",
    phaseOffset: tauPhase,
    color: "#4be8cf",
    alpha: 0.95,
    width: 2.4,
  });
  drawPulse(ctx, {
    x0: wallR + 3,
    x1: W - pad - 2,
    centerY: laneTransmitted,
    amp: amplitudeTransmitted,
    lambda: baseLambda,
    direction: "right",
    phaseOffset: tauPhase,
    color: "#bafff1",
    offset: 0.1,
  });
  drawPulse(ctx, {
    x0: wallR + 3,
    x1: W - pad - 2,
    centerY: laneTransmitted,
    amp: amplitudeTransmitted,
    lambda: baseLambda,
    direction: "right",
    phaseOffset: tauPhase,
    color: "#4be8cf",
    offset: 0.55,
  });

  // Étiquettes de voies.
  ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(139, 238, 255, 0.9)";
  ctx.fillText("INCIDENTE  →", pad + 2, laneIncident - baseAmp - 8);
  ctx.fillStyle = `rgba(255, 156, 144, ${0.55 + 0.4 * Math.sqrt(gammaAbs)})`;
  ctx.fillText("RÉFLÉCHIE  ←", pad + 2, laneReflected - baseAmp - 8);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(230, 251, 255, 0.82)";
  ctx.fillText("DANS LE MUR", W / 2, laneWall - baseAmp - 8);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(75, 232, 207, 0.92)";
  ctx.fillText("TRANSMISE  →", W - pad - 2, laneTransmitted - baseAmp - 8);

  // Cote d'épaisseur fixe.
  const dimY = H - 15;
  ctx.strokeStyle = "rgba(158, 223, 240, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wallX + 5, dimY);
  ctx.lineTo(wallR - 5, dimY);
  ctx.moveTo(wallX + 5, dimY - 4);
  ctx.lineTo(wallX + 5, dimY + 4);
  ctx.moveTo(wallR - 5, dimY - 4);
  ctx.lineTo(wallR - 5, dimY + 4);
  ctx.stroke();
  ctx.fillStyle = "rgba(189, 248, 255, 0.66)";
  ctx.font = "600 8.5px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("9,0 cm", W / 2, dimY - 5);

  if (W > 620) {
    ctx.fillStyle = "rgba(158, 223, 240, 0.55)";
    ctx.font = "500 9px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`f = ${fmtGHz(state.frequencyHz)}   ·   θ = ${fmtDeg(state.thetaDeg)}`, pad + 2, dimY + 2);
    ctx.textAlign = "right";
    ctx.fillText("vue schématique, échelles non respectées", W - pad - 2, dimY + 2);
  }
}

function resizeWaveCanvas() {
  if (!wave.canvas || !wave.wrap) return;
  const rect = wave.wrap.getBoundingClientRect();
  const width = Math.max(280, Math.round(rect.width || 600));
  const height = Math.max(240, Math.round(rect.height || 320));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  wave.canvas.width = Math.round(width * dpr);
  wave.canvas.height = Math.round(height * dpr);
  wave.ctx = wave.canvas.getContext("2d");
  wave.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wave.width = width;
  wave.height = height;
  drawWaveScene();
}

function animationLoop(timestamp) {
  const previous = wave.lastTs || timestamp;
  const delta = Math.min(0.055, Math.max(0, (timestamp - previous) / 1000));
  wave.lastTs = timestamp;
  if (state.playing && wave.visible && !document.hidden) {
    wave.clock += delta;
    drawWaveScene();
  }
  window.requestAnimationFrame(animationLoop);
}

/* --------------------------------------------------------------------------
   Thème, partage, export et navigation
   -------------------------------------------------------------------------- */

const SUN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2.2M12 18.8V21M4.22 4.22l1.56 1.56M18.22 18.22l1.56 1.56M3 12h2.2M18.8 12H21M4.22 19.78l1.56-1.56M18.22 5.78l1.56-1.56"/><circle cx="12" cy="12" r="3.6"/></svg>`;
const MOON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 14.6A8.4 8.4 0 0 1 9.4 3.6 8.5 8.5 0 1 0 20.4 14.6Z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>`;
const FULLSCREEN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg>`;

function applyTheme(theme, { persist = true } = {}) {
  const next = theme === "dark" ? "dark" : "light";
  state.theme = next;
  document.documentElement.dataset.theme = next;
  if (persist) {
    try {
      localStorage.setItem("bubblewave-theme", next);
    } catch {
      // Stockage indisponible : on continue sans persistance.
    }
  }
  if (dom.themeToggle) {
    dom.themeToggle.innerHTML = next === "dark" ? SUN_ICON : MOON_ICON;
    dom.themeToggle.setAttribute("aria-label", next === "dark" ? "Passer au thème clair" : "Passer au thème sombre");
    dom.themeToggle.title = next === "dark" ? "Passer au thème clair" : "Passer au thème sombre";
  }
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next === "dark" ? "#071523" : "#0b2545");
  if (chart) chart.setTheme(next);
  drawWaveScene();
}

function showToast(message) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => dom.toast.classList.remove("show"), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

async function copyShareLink() {
  updateUrl(true);
  const copied = await copyText(window.location.href);
  showToast(
    copied
      ? "Lien copié : il contient la porosité, la fréquence, l'angle et la polarisation."
      : "Copie impossible. Le lien est dans la barre d'adresse.",
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function formatCsvNumber(value) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(6).replace(".", ",");
}

function exportCsv() {
  if (!chartInfo) return;
  const header = chartInfo.csvHeader.join(";");
  const lines = chartInfo.csvRows.map((row) =>
    row.map((value) => (typeof value === "number" ? formatCsvNumber(value) : String(value))).join(";"),
  );
  const blob = new Blob([`\uFEFF${[header, ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${chartInfo.filename}.csv`);
  showToast(`Données exportées : ${chartInfo.filename}.csv`);
}

function exportChartPng() {
  if (!dom.chartCanvas || !chartInfo) return;
  dom.chartCanvas.toBlob(
    (blob) => {
      if (!blob) {
        showToast("Export PNG impossible dans ce navigateur.");
        return;
      }
      downloadBlob(blob, `${chartInfo.filename}.png`);
      showToast(`Graphique exporté : ${chartInfo.filename}.png`);
    },
    "image/png",
  );
}

function updatePlayButton() {
  if (!dom.playBtn) return;
  dom.playBtn.innerHTML = state.playing ? `${PAUSE_ICON}<span>Pause</span>` : `${PLAY_ICON}<span>Lecture</span>`;
  dom.playBtn.setAttribute("aria-pressed", String(state.playing));
  dom.playBtn.setAttribute("aria-label", state.playing ? "Mettre l'animation en pause" : "Démarrer l'animation");
}

function updateFullscreenButton() {
  if (!dom.fullscreenBtn) return;
  const active = Boolean(document.fullscreenElement);
  dom.fullscreenBtn.innerHTML = `${FULLSCREEN_ICON}<span>${active ? "Quitter" : "Plein écran"}</span>`;
  dom.fullscreenBtn.setAttribute("aria-label", active ? "Quitter le plein écran" : "Afficher l'animation en plein écran");
}

async function toggleFullscreen() {
  const target = wave.wrap;
  if (!target) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else {
      showToast("Le plein écran n'est pas disponible dans ce navigateur.");
    }
  } catch {
    showToast("Le plein écran n'est pas disponible dans ce navigateur.");
  }
}

function closeMenu() {
  if (!dom.mainNav || !dom.menuBtn) return;
  dom.mainNav.classList.remove("open");
  dom.menuBtn.setAttribute("aria-expanded", "false");
  dom.menuBtn.setAttribute("aria-label", "Ouvrir le menu");
}

function toggleMenu() {
  if (!dom.mainNav || !dom.menuBtn) return;
  const open = !dom.mainNav.classList.contains("open");
  dom.mainNav.classList.toggle("open", open);
  dom.menuBtn.setAttribute("aria-expanded", String(open));
  dom.menuBtn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
}

function setPresentation(active) {
  state.presenting = active;
  document.body.classList.toggle("is-presenting", active);
  if (dom.presentationHud) dom.presentationHud.hidden = !active;
  if (dom.presentBtn) dom.presentBtn.setAttribute("aria-pressed", String(active));
  if (active) {
    closeMenu();
    const lab = $id("simulateur");
    if (lab) window.scrollTo({ top: lab.offsetTop, behavior: "smooth" });
    window.setTimeout(resizeWaveCanvas, 400);
    showToast("Mode présentation. Appuyez sur Échap pour quitter.");
  } else {
    window.setTimeout(resizeWaveCanvas, 250);
    showToast("Mode présentation quitté.");
  }
}

function updateNavState() {
  if (dom.header) dom.header.classList.toggle("is-scrolled", window.scrollY > 8);
  const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
  const cursor = window.scrollY + headerHeight + 90;
  const sections = ["simulateur", "analyse", "modele", "theorie", "validation", "apropos"];
  let current = "";
  for (const id of sections) {
    const section = $id(id);
    if (section && section.offsetTop <= cursor) current = id;
  }
  $$(".main-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

function initTheoryNav() {
  const links = $$(".theory-nav a");
  const setActive = (link) => {
    links.forEach((item) => item.classList.toggle("active", item === link));
  };

  links.forEach((link) => {
    link.addEventListener("click", () => {
      setActive(link);
      const target = $(link.getAttribute("href"));
      if (target instanceof HTMLDetailsElement) target.open = true;
    });
  });

  $$(".theory-item").forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      const link = links.find((entry) => entry.getAttribute("href") === `#${item.id}`);
      if (link) setActive(link);
    });
  });

  const hash = window.location.hash;
  if (hash) {
    const target = $(hash);
    if (target instanceof HTMLDetailsElement && target.classList.contains("theory-item")) {
      target.open = true;
      const link = links.find((entry) => entry.getAttribute("href") === hash);
      if (link) setActive(link);
    }
  }
}

function initSiteLinks() {
  const github = (SITE.github || "").trim();
  const configured = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(github);
  [dom.githubLink, dom.repoLink].forEach((link) => {
    if (!link) return;
    if (configured) link.href = github;
    else link.hidden = true;
  });
  if (dom.authorLine) {
    dom.authorLine.textContent = SITE.author
      ? `Réalisé par ${SITE.author}.`
      : "Projet pédagogique — ENSA Tanger, filière GSR1.";
  }
}

/* --------------------------------------------------------------------------
   Événements et démarrage
   -------------------------------------------------------------------------- */

function bindEvents() {
  if (dom.bubbleSlider) {
    dom.bubbleSlider.addEventListener("input", () => {
      state.bubbleFraction = Number(dom.bubbleSlider.value);
      scheduleRefresh();
    });
  }

  if (dom.frequencySlider) {
    dom.frequencySlider.addEventListener("input", () => {
      state.frequencyHz = Number(dom.frequencySlider.value) * 1e9;
      scheduleRefresh();
    });
  }

  if (dom.angleSlider) {
    dom.angleSlider.addEventListener("input", () => {
      state.thetaDeg = Number(dom.angleSlider.value);
      scheduleRefresh();
    });
  }

  $$("[data-pol]").forEach((button) => {
    button.addEventListener("click", () => {
      state.polarization = button.dataset.pol === "TM" ? "TM" : "TE";
      scheduleRefresh();
    });
  });

  $$(".chart-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.chartTab = CHART_TABS.includes(button.dataset.chart) ? button.dataset.chart : "density";
      scheduleRefresh();
    });
  });

  dom.themeToggle?.addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  });
  dom.presentBtn?.addEventListener("click", () => setPresentation(true));
  dom.presentExit?.addEventListener("click", () => setPresentation(false));
  dom.shareBtn?.addEventListener("click", copyShareLink);
  dom.csvBtn?.addEventListener("click", exportCsv);
  dom.chartCsv?.addEventListener("click", exportCsv);
  dom.chartPng?.addEventListener("click", exportChartPng);

  dom.playBtn?.addEventListener("click", () => {
    state.playing = !state.playing;
    wave.lastTs = performance.now();
    updatePlayButton();
    if (!state.playing) drawWaveScene();
  });

  dom.fullscreenBtn?.addEventListener("click", toggleFullscreen);

  dom.menuBtn?.addEventListener("click", toggleMenu);
  $$(".main-nav a").forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("click", (event) => {
    if (!dom.mainNav || !dom.menuBtn) return;
    if (!dom.mainNav.classList.contains("open")) return;
    if (dom.mainNav.contains(event.target) || dom.menuBtn.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
    if (state.presenting) setPresentation(false);
  });

  document.addEventListener("fullscreenchange", () => {
    updateFullscreenButton();
    window.setTimeout(resizeWaveCanvas, 80);
  });

  document.addEventListener("visibilitychange", () => {
    wave.lastTs = performance.now();
  });

  let scrollScheduled = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      window.requestAnimationFrame(() => {
        scrollScheduled = false;
        updateNavState();
      });
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) closeMenu();
    window.setTimeout(resizeWaveCanvas, 80);
  });

  REDUCED_MOTION.addEventListener?.("change", (event) => {
    if (event.matches) {
      state.playing = false;
      updatePlayButton();
    }
  });

  if (window.ResizeObserver && wave.wrap) {
    const observer = new ResizeObserver(() => resizeWaveCanvas());
    observer.observe(wave.wrap);
  }

  if (window.IntersectionObserver && wave.wrap) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) wave.visible = entry.isIntersecting;
        wave.lastTs = performance.now();
        if (wave.visible) drawWaveScene();
      },
      { threshold: 0.08 },
    );
    observer.observe(wave.wrap);
  }
}

function init() {
  renderPresets();
  initSiteLinks();
  applyTheme(state.theme, { persist: false });

  if (dom.chartCanvas) {
    chart = new CanvasChart(dom.chartCanvas);
    chart.setTheme(state.theme);
  }

  bindEvents();
  initTheoryNav();
  resizeWaveCanvas();
  refresh({ updateHistory: true });
  updateBenchmark();
  updatePlayButton();
  updateFullscreenButton();
  updateNavState();
  wave.loopStarted = true;
  window.requestAnimationFrame(animationLoop);

  window.setTimeout(() => {
    resizeWaveCanvas();
    chart?.resize();
    updateNavState();
  }, 300);
}

init();


