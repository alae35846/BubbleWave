import assert from "node:assert/strict";
import test from "node:test";

import {
  airyNormal,
  brewsterAngle,
  computeSlab,
  electricFieldProfile,
  matrixPermittivity,
  maxwellGarnett,
  maxwellGarnettSpheroid,
  spheroidDepolarization,
  sweepAngle,
  sweepDensity,
  sweepFrequency,
  validateModel,
} from "../site/assets/js/physics.js";

const EPS_AIR = { re: 1, im: 0 };
const EPS_CONCRETE = matrixPermittivity(6.0, 0.03);
const THICKNESS_M = 0.09;
const FREQUENCY_HZ = 1e9;

const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} n'est pas dans ±${tolerance} de ${expected}`,
  );
};

test("scénario de référence : mur plein, 1 GHz, incidence normale, TE", () => {
  const slab = computeSlab({
    frequencyHz: FREQUENCY_HZ,
    thetaDeg: 0,
    polarization: "TE",
    epsWall: EPS_CONCRETE,
    thicknessM: THICKNESS_M,
  });

  closeTo(slab.R, 0.4618186854295912, 1e-12, "R");
  closeTo(slab.T, 0.444544039221551, 1e-12, "T");
  closeTo(slab.absorption, 0.09363727534885785, 1e-12, "A");
  closeTo(slab.R + slab.T + slab.absorption, 1, 1e-12, "R + T + A");
});

test("scénario par défaut à 20 % de bulles", () => {
  const epsWall = maxwellGarnett(EPS_CONCRETE, EPS_AIR, 0.2);
  const slab = computeSlab({
    frequencyHz: FREQUENCY_HZ,
    thetaDeg: 0,
    polarization: "TE",
    epsWall,
    thicknessM: THICKNESS_M,
  });

  closeTo(epsWall.re, 4.714302703608321, 1e-12, "ε′ effectif");
  closeTo(epsWall.im, -0.1315097235265075, 1e-12, "ε″ effectif");
  closeTo(slab.R, 0.2954505903531928, 1e-12, "R");
  closeTo(slab.T, 0.603114560646715, 1e-12, "T");
  closeTo(slab.absorption, 0.10143484900009225, 1e-12, "A");
});

test("Maxwell-Garnett respecte les deux limites physiques", () => {
  const empty = maxwellGarnett(EPS_CONCRETE, EPS_AIR, 0);
  const full = maxwellGarnett(EPS_CONCRETE, EPS_AIR, 1);

  closeTo(empty.re, EPS_CONCRETE.re, 1e-15, "ε_eff(0) réel");
  closeTo(empty.im, EPS_CONCRETE.im, 1e-15, "ε_eff(0) imaginaire");
  closeTo(full.re, 1, 1e-15, "ε_eff(1) réel");
  closeTo(full.im, 0, 1e-15, "ε_eff(1) imaginaire");

  const intermediate = maxwellGarnett(EPS_CONCRETE, EPS_AIR, 0.35);
  assert.ok(intermediate.re < EPS_CONCRETE.re && intermediate.re > 1);
  assert.ok(intermediate.im > EPS_CONCRETE.im && intermediate.im < 0);
});

test("le TMM reproduit la formule d'Airy en incidence normale", () => {
  const cases = [
    { eps: matrixPermittivity(6.0, 0.03), f: 1e9 },
    { eps: matrixPermittivity(4.2, 0.08), f: 2.45e9 },
    { eps: { re: 9.0, im: 0 }, f: 5.8e9 },
  ];

  for (const { eps, f } of cases) {
    const tmm = computeSlab({
      frequencyHz: f,
      thetaDeg: 0,
      polarization: "TE",
      epsWall: eps,
      thicknessM: THICKNESS_M,
    });
    const airy = airyNormal(eps, THICKNESS_M, f);

    closeTo(tmm.R, airy.R, 1e-12, `R TMM/Airy à ${f / 1e9} GHz`);
    closeTo(tmm.T, airy.T, 1e-12, `T TMM/Airy à ${f / 1e9} GHz`);
    closeTo(tmm.absorption, airy.absorption, 1e-12, `A TMM/Airy à ${f / 1e9} GHz`);
  }
});

test("le bilan d'énergie tient sur les balayages porosité, fréquence et angle", () => {
  const density = sweepDensity({
    frequencyHz: FREQUENCY_HZ,
    thetaDeg: 37,
    polarization: "TM",
    epsMatrix: EPS_CONCRETE,
    epsInclusion: EPS_AIR,
    thicknessM: THICKNESS_M,
    points: 151,
  });
  const frequency = sweepFrequency({
    fraction: 0.33,
    frequencyMinHz: 0.5e9,
    frequencyMaxHz: 6e9,
    thetaDeg: 55,
    polarization: "TE",
    epsMatrix: EPS_CONCRETE,
    epsInclusion: EPS_AIR,
    thicknessM: THICKNESS_M,
    points: 201,
  });
  const angle = sweepAngle({
    fraction: 0.42,
    frequencyHz: 4.2e9,
    polarization: "TM",
    thetaMinDeg: 0,
    thetaMaxDeg: 80,
    epsMatrix: EPS_CONCRETE,
    epsInclusion: EPS_AIR,
    thicknessM: THICKNESS_M,
    points: 121,
  });

  for (const rows of [density, frequency, angle]) {
    for (const row of rows) {
      assert.ok(Number.isFinite(row.R) && row.R >= 0 && row.R <= 1);
      assert.ok(Number.isFinite(row.T) && row.T >= 0 && row.T <= 1);
      assert.ok(Number.isFinite(row.A) && row.A >= -1e-12 && row.A <= 1);
      closeTo(row.R + row.T + row.A, 1, 1e-12, "bilan d'énergie");
    }
  }
});

test("l'angle de Brewster sans pertes vaut arctan(√ε_r)", () => {
  const epsLossless = { re: 6, im: 0 };
  const expected = (Math.atan(Math.sqrt(epsLossless.re)) * 180) / Math.PI;
  const minimum = brewsterAngle({
    frequencyHz: FREQUENCY_HZ,
    epsMatrix: epsLossless,
    epsInclusion: EPS_AIR,
    fraction: 0,
    thicknessM: THICKNESS_M,
  });

  closeTo(minimum.thetaDeg, expected, 0.15, "angle de Brewster");
  assert.ok(minimum.R < 1e-6, `R minimal trop élevé : ${minimum.R}`);
});

test("le profil de champ est continu aux faces et normalisé à l'onde incidente", () => {
  const epsWall = maxwellGarnett(EPS_CONCRETE, EPS_AIR, 0.2);
  const profile = electricFieldProfile({
    frequencyHz: FREQUENCY_HZ,
    thetaDeg: 35,
    polarization: "TM",
    epsWall,
    thicknessM: THICKNESS_M,
    points: 1200,
  });

  assert.equal(profile.points.length, 1200);
  assert.ok(profile.points.every((point) => Number.isFinite(point.mag)));
  assert.ok(profile.points.every((point) => point.mag >= 0));

  const slab = profile.model;
  const rightSide = profile.points.at(-1);
  closeTo(rightSide.mag, Math.sqrt(slab.T), 2e-4, "|E| en sortie");

  const wallPoints = profile.points.filter((point) => point.region === "wall");
  assert.ok(wallPoints.length > 100);
  assert.ok(wallPoints.every((point) => point.mag < 3));
});

test("validateModel réussit tous ses contrôles numériques", () => {
  const validation = validateModel({
    frequencyHz: FREQUENCY_HZ,
    thetaDeg: 0,
    polarization: "TE",
    epsMatrix: EPS_CONCRETE,
    epsInclusion: EPS_AIR,
    thicknessM: THICKNESS_M,
  });

  assert.equal(validation.checks.length, 4);
  assert.ok(validation.allPass);
  assert.ok(validation.maxEnergyError < 1e-10);
  assert.ok(validation.maxAiryError < 1e-10);
});

test("spheroïdes: limite sphérique",()=>{for(const shape of ["prolate","oblate"]){const a=maxwellGarnettSpheroid(EPS_CONCRETE,EPS_AIR,.2,shape,1),b=maxwellGarnett(EPS_CONCRETE,EPS_AIR,.2);closeTo(a.re,b.re,1e-12,shape+" réel");closeTo(a.im,b.im,1e-12,shape+" imaginaire");}});
test("facteurs de dépolarisation positifs et normalisés",()=>{for(const shape of ["prolate","oblate"]){const L=spheroidDepolarization(shape,2.5);assert.ok(L.parallel>0&&L.parallel<1&&L.perpendicular>0&&L.perpendicular<1);closeTo(L.parallel+2*L.perpendicular,1,1e-12,shape);}});
test("silhouettes non sphériques changent epsilon effectif et énergie",()=>{const sphere=maxwellGarnettSpheroid(EPS_CONCRETE,EPS_AIR,.25,"sphere",1);for(const shape of ["prolate","oblate"]){const e=maxwellGarnettSpheroid(EPS_CONCRETE,EPS_AIR,.25,shape,2.5);assert.ok(Math.abs(e.re-sphere.re)>1e-5);const m=computeSlab({frequencyHz:FREQUENCY_HZ,thetaDeg:31,polarization:"TE",epsWall:e,thicknessM:THICKNESS_M});closeTo(m.R+m.T+m.absorption,1,1e-10,shape+" énergie");}});
test("balayage fréquentiel dépend de la silhouette choisie",()=>{const common={fraction:.3,frequencyMinHz:.8e9,frequencyMaxHz:2e9,thetaDeg:20,polarization:"TM",epsMatrix:EPS_CONCRETE,thicknessM:THICKNESS_M,points:21};const a=sweepFrequency({...common,shape:"sphere"}),b=sweepFrequency({...common,shape:"prolate",aspectRatio:3});assert.ok(b.some((row,i)=>Math.abs(row.R-a[i].R)>1e-6));});
