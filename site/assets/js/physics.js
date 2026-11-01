/**
 * BubbleWave — noyau physique.
 *
 * Le mur est traité comme une lame homogène équivalente :
 *   air  |  béton + bulles  |  air
 *
 * - permittivité effective des bulles : modèle de Maxwell-Garnett ;
 * - propagation dans la lame : matrice de transfert (TMM), qui tient compte
 *   des réflexions multiples (Fabry-Pérot) ;
 * - incidence normale ou oblique, polarisations TE / TM.
 *
 * Convention temporelle : e^{+jωt}, donc une onde se propageant vers +z
 * s'écrit e^{-j k_z z}. Les milieux passifs vérifient Im(k_z) <= 0.
 *
 * Les coefficients renvoyés sont :
 *   Gamma : réflexion en amplitude (champ électrique tangentiel) ;
 *   tau   : transmission en amplitude (champ électrique tangentiel) ;
 *   R     : |Gamma|², réflexion en énergie ;
 *   T     : |tau|², transmission en énergie (milieu extérieur identique) ;
 *   A     : 1 - R - T, absorption dans le mur.
 */

export const C0 = 299_792_458;
export const ETA0 = 376.730313668;
export const EPS0 = 8.854_187_812_8e-12;
export const MU0 = 1.256_637_062_12e-6;

export const cx = {
  of(re, im = 0) {
    return { re, im };
  },
  zero() {
    return { re: 0, im: 0 };
  },
  one() {
    return { re: 1, im: 0 };
  },
  add(a, b) {
    return { re: a.re + b.re, im: a.im + b.im };
  },
  sub(a, b) {
    return { re: a.re - b.re, im: a.im - b.im };
  },
  mul(a, b) {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  },
  scale(a, s) {
    return { re: a.re * s, im: a.im * s };
  },
  div(a, b) {
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) return { re: NaN, im: NaN };
    return {
      re: (a.re * b.re + a.im * b.im) / d,
      im: (a.im * b.re - a.re * b.im) / d,
    };
  },
  inv(a) {
    return cx.div(cx.one(), a);
  },
  neg(a) {
    return { re: -a.re, im: -a.im };
  },
  conj(a) {
    return { re: a.re, im: -a.im };
  },
  abs(a) {
    return Math.hypot(a.re, a.im);
  },
  abs2(a) {
    return a.re * a.re + a.im * a.im;
  },
  arg(a) {
    return Math.atan2(a.im, a.re);
  },
  exp(a) {
    const e = Math.exp(a.re);
    return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
  },
  log(a) {
    return { re: Math.log(cx.abs(a)), im: cx.arg(a) };
  },
  sqrt(a) {
    const r = cx.abs(a);
    const theta = cx.arg(a);
    const sr = Math.sqrt(Math.max(r, 0));
    return { re: sr * Math.cos(theta / 2), im: sr * Math.sin(theta / 2) };
  },
  cos(a) {
    return {
      re: Math.cos(a.re) * Math.cosh(a.im),
      im: -Math.sin(a.re) * Math.sinh(a.im),
    };
  },
  sin(a) {
    return {
      re: Math.sin(a.re) * Math.cosh(a.im),
      im: Math.cos(a.re) * Math.sinh(a.im),
    };
  },
};

export const I = { re: 0, im: 1 };
export const ONE = { re: 1, im: 0 };
export const ZERO = { re: 0, im: 0 };

/**
 * Racine carrée avec coupure physique pour un milieu passif :
 * on impose Re >= 0 et Im <= 0 (atténuation dans le sens +z).
 */
export function cSqrtPassive(a) {
  let s = cx.sqrt(a);
  if (s.im > 1e-13) s = cx.neg(s);
  if (Math.abs(s.im) <= 1e-13 && s.re < 0) s = cx.neg(s);
  return s;
}

/**
 * Permittivité relative complexe d'un mélange matrice + inclusions
 * sphériques (Maxwell-Garnett).
 *
 * @param {object} epsMatrix permittivité complexe de la matrice
 * @param {object} epsInclusion permittivité complexe des inclusions
 * @param {number} f fraction volumique des inclusions, 0 <= f <= 1
 */
export function maxwellGarnett(epsMatrix, epsInclusion, f) {
  const phi = Math.min(1, Math.max(0, f));
  if (phi === 0) return { ...epsMatrix };
  if (phi === 1) return { ...epsInclusion };
  const num = cx.add(
    cx.add(epsInclusion, cx.scale(epsMatrix, 2)),
    cx.scale(cx.sub(epsInclusion, epsMatrix), 2 * phi),
  );
  const den = cx.sub(
    cx.add(epsInclusion, cx.scale(epsMatrix, 2)),
    cx.scale(cx.sub(epsInclusion, epsMatrix), phi),
  );
  return cx.mul(epsMatrix, cx.div(num, den));
}

/**
 * Facteurs de dépolarisation d'un sphéroïde. q>=1 :
 * prolate: q = longueur/diamètre ; oblate: q = diamètre/épaisseur.
 */
export function spheroidDepolarization(shape="sphere",aspectRatio=1) {
 const q=Math.max(1,Number(aspectRatio)||1);
 if(shape==="sphere"||Math.abs(q-1)<1e-8)return {parallel:1/3,perpendicular:1/3};
 if(shape==="prolate"){const e=Math.sqrt(1-1/(q*q));const parallel=(1-e*e)/(2*e**3)*(Math.log((1+e)/(1-e))-2*e);return {parallel,perpendicular:(1-parallel)/2};}
 if(shape==="oblate"){const e=Math.sqrt(q*q-1);const parallel=((1+e*e)/e**3)*(e-Math.atan(e));return {parallel,perpendicular:(1-parallel)/2};}
 throw new RangeError(`Silhouette inconnue : ${shape}`);
}
/** Maxwell-Garnett sphéroïdal moyenné sur des orientations aléatoires. */
export function maxwellGarnettSpheroid(epsMatrix,epsInclusion,fraction,shape="sphere",aspectRatio=1){
 if(shape==="sphere"||Math.abs(aspectRatio-1)<1e-8)return maxwellGarnett(epsMatrix,epsInclusion,fraction);
 const phi=Math.min(.5,Math.max(0,fraction));if(phi===0)return {...epsMatrix};
 const L=spheroidDepolarization(shape,aspectRatio),delta=cx.sub(epsInclusion,epsMatrix);
 const axis=factor=>cx.add(epsMatrix,cx.div(cx.scale(cx.mul(epsMatrix,delta),phi),cx.add(epsMatrix,cx.scale(delta,(1-phi)*factor))));
 return cx.scale(cx.add(axis(L.parallel),cx.scale(axis(L.perpendicular),2)),1/3);
}
/**
 * Permittivité de la matrice du mur à partir de sa permittivité relative
 * réelle et de sa tangente de pertes : eps = eps' (1 - j tanδ).
 */
export function matrixPermittivity(epsReal, tanDelta) {
  return { re: epsReal, im: -epsReal * tanDelta };
}

/**
 * Petites fonctions de conversion.
 */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

/**
 * Champ électrique tangentiel dans les trois régions.
 * Utile pour le profil |E(z)| et pour l'animation.
 */
export function electricFieldProfile({
  frequencyHz,
  thetaDeg,
  polarization,
  epsWall,
  thicknessM,
  epsOuter = ONE,
  lambdaSpan = 1.6,
  points = 720,
}) {
  const model = computeSlab({
    frequencyHz,
    thetaDeg,
    polarization,
    epsWall,
    thicknessM,
    epsOuter,
  });
  const { kzOut, kzWall, Gamma: r, tau: t, gammaWall } = model;
  const nOut = cSqrtPassive(epsOuter);
  const lambdaOut = C0 / (frequencyHz * Math.max(nOut.re, 1e-9));
  const zMin = -lambdaSpan * lambdaOut;
  const zMax = thicknessM + lambdaSpan * lambdaOut;

  const yOut = model.yOut;
  const yWall = model.yWall;
  const ratio = cx.div(yOut, yWall);
  // Ondes forward / backward dans la lame, déduites de la continuité de
  // E_t et H_t à la première interface (E_i = 1).
  const EfFull = cx.scale(
    cx.add(cx.add(ONE, r), cx.mul(ratio, cx.sub(ONE, r))),
    0.5,
  );
  const EbFull = cx.scale(
    cx.sub(cx.add(ONE, r), cx.mul(ratio, cx.sub(ONE, r))),
    0.5,
  );

  const out = [];
  for (let i = 0; i < points; i += 1) {
    const z = zMin + ((zMax - zMin) * i) / (points - 1);
    let E;
    if (z < 0) {
      E = cx.add(
        cx.exp(cx.mul(cx.scale(I, -z), kzOut)),
        cx.mul(r, cx.exp(cx.mul(cx.scale(I, z), kzOut))),
      );
    } else if (z <= thicknessM) {
      E = cx.add(
        cx.mul(EfFull, cx.exp(cx.mul(cx.scale(I, -z), kzWall))),
        cx.mul(EbFull, cx.exp(cx.mul(cx.scale(I, z), kzWall))),
      );
    } else {
      E = cx.mul(
        t,
        cx.exp(cx.mul(cx.scale(I, -(z - thicknessM)), kzOut)),
      );
    }
    out.push({
      z,
      re: E.re,
      im: E.im,
      mag: cx.abs(E),
      region: z < 0 ? "air-left" : z <= thicknessM ? "wall" : "air-right",
    });
  }
  return {
    model,
    zMin,
    zMax,
    lambdaOut,
    points: out,
    Ef: EfFull,
    Eb: EbFull,
    gammaWall,
  };
}

/**
 * Cœur du simulateur : lame homogène entre deux demi-espaces.
 *
 * @returns {object} coefficients complexes, impédances, angles, etc.
 */
export function computeSlab({
  frequencyHz,
  thetaDeg,
  polarization = "TE",
  epsWall,
  thicknessM,
  epsOuter = ONE,
}) {
  const f = Math.max(1, frequencyHz);
  const k0 = (2 * Math.PI * f) / C0;
  const theta = degToRad(thetaDeg);
  const nOut = cSqrtPassive(epsOuter);
  const nWall = cSqrtPassive(epsWall);
  const kx = cx.scale(nOut, k0 * Math.sin(theta));
  const kzOut = cSqrtPassive(
    cx.sub(cx.scale(cx.mul(nOut, nOut), k0 * k0), cx.mul(kx, kx)),
  );
  const kzWall = cSqrtPassive(
    cx.sub(cx.scale(cx.mul(nWall, nWall), k0 * k0), cx.mul(kx, kx)),
  );

  const isTM = polarization === "TM";
  const yOut = isTM
    ? cx.div(cx.scale(cx.mul(nOut, nOut), k0), kzOut)
    : cx.div(kzOut, cx.of(k0));
  const yWall = isTM
    ? cx.div(cx.scale(cx.mul(nWall, nWall), k0), kzWall)
    : cx.div(kzWall, cx.of(k0));

  const delta = cx.scale(kzWall, thicknessM);
  const cosD = cx.cos(delta);
  const sinD = cx.sin(delta);
  const A = cosD;
  const B = cx.mul(I, cx.div(sinD, yWall));
  const C = cx.mul(I, cx.mul(yWall, sinD));
  const D = cosD;
  const yL = yOut;
  const yIn = cx.div(
    cx.add(C, cx.mul(D, yL)),
    cx.add(A, cx.mul(B, yL)),
  );
  const gamma = cx.div(cx.sub(yOut, yIn), cx.add(yOut, yIn));
  const tau = cx.div(
    cx.add(ONE, gamma),
    cx.add(A, cx.mul(B, yL)),
  );

  const R = clamp01(cx.abs2(gamma));
  const T = Math.max(0, cx.abs2(tau));
  const absorption = 1 - R - T;

  const lambda0 = C0 / f;
  const nReal = Math.max(nWall.re, 1e-9);
  const lambdaWall = lambda0 / nReal;
  const alphaWall = Math.max(0, -kzWall.im);
  const betaWall = Math.max(0, kzWall.re);
  const thetaWall = Math.atan2(kx.re, Math.max(kzWall.re, 1e-12));
  const opticalThickness = thicknessM / lambdaWall;
  const attenuationDb = 8.685_889_638 * alphaWall * thicknessM;
  const phaseThicknessDeg = radToDeg(betaWall * thicknessM) % 360;

  return {
    frequencyHz: f,
    thetaDeg,
    polarization,
    k0,
    nOut,
    nWall,
    epsWall,
    thicknessM,
    kx,
    kzOut,
    kzWall,
    yOut,
    yWall,
    delta,
    A,
    B,
    C,
    D,
    yIn,
    Gamma: gamma,
    tau,
    R,
    T,
    absorption,
    lambda0,
    lambdaWall,
    nReal,
    nImag: nWall.im,
    alphaWall,
    betaWall,
    thetaWall,
    thetaWallDeg: radToDeg(thetaWall),
    opticalThickness,
    attenuationDb,
    phaseThicknessDeg,
    waveImpedance: cx.div(ONE, yWall),
    gammaWall: { re: alphaWall, im: betaWall },
    // TOS = |Gamma| et ROS = (1+|Gamma|)/(1-|Gamma|)
    standingWaveRatio: cx.abs(gamma),
    vswr: cx.abs(gamma) >= 1 ? Infinity : (1 + cx.abs(gamma)) / (1 - cx.abs(gamma)),
    reflectionPhaseDeg: radToDeg(cx.arg(gamma)),
    transmissionPhaseDeg: radToDeg(cx.arg(tau)),
  };
}

/**
 * Formule d'Airy pour une lame symétrique en incidence normale.
 * Sert de contrôle indépendant du TMM.
 */
export function airyNormal(epsWall, thicknessM, frequencyHz) {
  const k0 = (2 * Math.PI * frequencyHz) / C0;
  const n = cSqrtPassive(epsWall);
  const r01 = cx.div(cx.sub(ONE, n), cx.add(ONE, n));
  const beta = cx.scale(n, k0 * thicknessM);
  const e2 = cx.exp(cx.mul(I, cx.scale(beta, -2)));
  const denom = cx.sub(ONE, cx.mul(cx.mul(r01, r01), e2));
  const r = cx.div(cx.mul(r01, cx.sub(ONE, e2)), denom);
  const t01 = cx.div(cx.scale(ONE, 2), cx.add(ONE, n));
  const t10 = cx.div(cx.scale(n, 2), cx.add(ONE, n));
  const t = cx.div(
    cx.mul(cx.mul(t01, t10), cx.exp(cx.mul(I, cx.scale(beta, -1)))),
    denom,
  );
  return {
    Gamma: r,
    tau: t,
    R: cx.abs2(r),
    T: cx.abs2(t),
    absorption: 1 - cx.abs2(r) - cx.abs2(t),
  };
}

/**
 * Balayage de la porosité pour les graphiques.
 */
export function sweepDensity({
  frequencyHz,
  thetaDeg,
  polarization,
  epsMatrix,
  epsInclusion = ONE,
  thicknessM,
  maxFraction = 0.5,
  points = 121,
}) {
  const rows = [];
  for (let i = 0; i < points; i += 1) {
    const phi = (maxFraction * i) / (points - 1);
    const epsWall = maxwellGarnett(epsMatrix, epsInclusion, phi);
    const s = computeSlab({
      frequencyHz,
      thetaDeg,
      polarization,
      epsWall,
      thicknessM,
    });
    rows.push({
      x: phi,
      R: s.R,
      T: s.T,
      A: s.absorption,
      epsWall,
      nReal: s.nReal,
      nImag: s.nImag,
      thetaWallDeg: s.thetaWallDeg,
      lambdaWall: s.lambdaWall,
      attenuationDb: s.attenuationDb,
    });
  }
  return rows;
}

export function sweepFrequency({
  fraction,
  frequencyMinHz,
  frequencyMaxHz,
  thetaDeg,
  polarization,
  epsMatrix,
  epsInclusion = ONE,
  thicknessM,
  points = 241,
  shape = "sphere",
  aspectRatio = 1,
}) {
  const epsWall = maxwellGarnettSpheroid(epsMatrix, epsInclusion, fraction, shape, aspectRatio);
  const rows = [];
  for (let i = 0; i < points; i += 1) {
    const f = frequencyMinHz + ((frequencyMaxHz - frequencyMinHz) * i) / (points - 1);
    const s = computeSlab({
      frequencyHz: f,
      thetaDeg,
      polarization,
      epsWall,
      thicknessM,
    });
    rows.push({ x: f / 1e9, R: s.R, T: s.T, A: s.absorption });
  }
  return rows;
}

export function sweepAngle({
  fraction,
  frequencyHz,
  polarization,
  thetaMinDeg = 0,
  thetaMaxDeg = 85,
  epsMatrix,
  epsInclusion = ONE,
  thicknessM,
  points = 181,
}) {
  const epsWall = maxwellGarnett(epsMatrix, epsInclusion, fraction);
  const rows = [];
  for (let i = 0; i < points; i += 1) {
    const theta = thetaMinDeg + ((thetaMaxDeg - thetaMinDeg) * i) / (points - 1);
    const s = computeSlab({
      frequencyHz,
      thetaDeg: theta,
      polarization,
      epsWall,
      thicknessM,
    });
    rows.push({ x: theta, R: s.R, T: s.T, A: s.absorption });
  }
  return rows;
}

/**
 * Angle de Brewster (TM) : minimum numérique de R.
 * En milieu sans pertes, R y est quasi nul.
 */
export function brewsterAngle({
  frequencyHz,
  epsMatrix,
  epsInclusion = ONE,
  fraction,
  thicknessM,
  thetaMaxDeg = 89,
  points = 890,
}) {
  const epsWall = maxwellGarnett(epsMatrix, epsInclusion, fraction);
  let best = { thetaDeg: 0, R: Infinity, T: 0, A: 0 };
  for (let i = 0; i <= points; i += 1) {
    const theta = (thetaMaxDeg * i) / points;
    const s = computeSlab({
      frequencyHz,
      thetaDeg: theta,
      polarization: "TM",
      epsWall,
      thicknessM,
    });
    if (s.R < best.R) best = { thetaDeg: theta, R: s.R, T: s.T, A: s.absorption };
  }
  return best;
}

/**
 * Vérifications numériques affichées dans la page.
 */
export function validateModel({
  frequencyHz,
  thetaDeg,
  polarization,
  epsMatrix,
  epsInclusion = ONE,
  thicknessM,
  maxFraction = 0.5,
  points = 121,
}) {
  const density = sweepDensity({
    frequencyHz,
    thetaDeg,
    polarization,
    epsMatrix,
    epsInclusion,
    thicknessM,
    maxFraction,
    points,
  });

  const energyError = density.reduce(
    (m, row) => Math.max(m, Math.abs(row.R + row.T + row.A - 1)),
    0,
  );

  let airyError = 0;
  for (const row of density) {
    const a = airyNormal(row.epsWall, thicknessM, frequencyHz);
    airyError = Math.max(
      airyError,
      Math.abs(a.R - row.R),
      Math.abs(a.T - row.T),
    );
  }

  const mg0 = maxwellGarnett(epsMatrix, epsInclusion, 0);
  const mg1 = maxwellGarnett(epsMatrix, epsInclusion, 1);
  const mg0Error = cx.abs(cx.sub(mg0, epsMatrix));
  const mg1Error = cx.abs(cx.sub(mg1, epsInclusion));

  const checks = [
    {
      id: "energy",
      label: "Conservation de l'énergie : R + T + A = 1",
      value: energyError,
      tolerance: 1e-10,
      pass: energyError < 1e-10,
      detail: "sur tout le balayage de porosité",
    },
    {
      id: "airy",
      label: "Comparaison TMM / formule d'Airy (incidence normale)",
      value: airyError,
      tolerance: 1e-10,
      pass: airyError < 1e-10,
      detail: "deux méthodes indépendantes",
    },
    {
      id: "mg0",
      label: "Limite de Maxwell-Garnett sans bulle",
      value: mg0Error,
      tolerance: 1e-12,
      pass: mg0Error < 1e-12,
      detail: "ε_eff(0) = ε_matrice",
    },
    {
      id: "mg1",
      label: "Limite de Maxwell-Garnett à 100 % d'air",
      value: mg1Error,
      tolerance: 1e-12,
      pass: mg1Error < 1e-12,
      detail: "ε_eff(1) = ε_air",
    },
  ];

  return {
    checks,
    maxEnergyError: energyError,
    maxAiryError: airyError,
    allPass: checks.every((c) => c.pass),
    density,
  };
}

/**
 * Petit générateur pseudo-aléatoire déterministe (pour les bulles du dessin).
 */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
