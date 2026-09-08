/**
 * Rich starfield — catalog Points (spectral color + size) + subtle constellation
 * lines + GPU twinkle. No Milky Way texture. Lean PointsMaterial + onBeforeCompile.
 *
 * Catalog: bright-star subset (BSC / Hipparcos-style RA/Dec/mag/B−V), southern-heavy
 * for Brazil (~23°S). Field stars fill the sphere (seeded, faint).
 */

import * as THREE from 'three';

/** São Paulo–ish latitude — tilt so southern sky sits higher. */
const OBSERVER_LAT_DEG = -23.5;

/**
 * Compact bright-star catalog.
 * Each entry: [raHours, decDeg, mag, bv]
 * Source: Yale Bright Star Catalogue / Hipparcos positions (public astron. data).
 * Southern figures first; then Orion & northern anchors still visible from Brazil.
 */
const CATALOG = [
  // — Crux (Southern Cross) —
  [12.4433, -63.0991, 0.77, -0.24], // α Acrux
  [12.7953, -59.6888, 1.25, -0.23], // β Mimosa
  [12.5194, -57.1132, 1.59, 1.59],  // γ Gacrux
  [12.2520, -58.7489, 2.79, -0.24], // δ Crucis
  [12.3577, -58.9999, 3.59, -0.18], // ε Crucis
  // — Centaurus —
  [14.6601, -60.8356, -0.01, 0.71], // α Rigil Kentaurus
  [14.0637, -60.3730, 0.61, -0.23], // β Hadar
  [14.1114, -36.3690, 2.06, 1.01],  // θ Menkent
  [11.8960, -63.0991, 2.30, -0.22], // γ Cen
  [13.9254, -42.1578, 2.55, -0.18], // ε Cen
  [13.3434, -36.7861, 2.33, -0.15], // δ / η region
  [12.6920, -48.9599, 2.55, 0.90],  // ι / ζ-ish
  [14.9860, -42.1042, 2.80, -0.20], // κ Cen
  // — Carina —
  [6.3992, -52.6957, -0.74, 0.15],  // α Canopus
  [10.7502, -64.3945, 1.86, -0.19], // β Miaplacidus
  [9.2200, -59.6840, 1.67, -0.19],  // ε Avior
  [10.7159, -59.2758, 2.25, -0.19], // ι Aspidiske
  [9.7850, -65.0720, 2.74, 1.20],   // θ / ω region
  [11.1322, -61.3325, 3.10, -0.10], // υ Car
  // — Vela —
  [8.1589, -47.3366, 1.75, -0.11],  // γ Regor
  [9.1333, -43.4326, 1.96, -0.14],  // δ Vel
  [8.7410, -54.7086, 2.21, -0.10],  // λ Vel
  [10.7795, -49.4202, 2.47, -0.18], // κ Vel
  [9.3680, -51.0660, 3.16, -0.10],  // φ Vel
  // — Puppis —
  [7.2855, -37.0975, 2.21, -0.11],  // ζ Naos
  [8.1257, -24.3044, 2.81, -0.10],  // π Pup
  [7.4872, -43.3018, 2.93, 1.21],   // σ Pup
  [6.6294, -48.1926, 3.17, -0.15],  // τ Pup
  // — Scorpius —
  [16.4901, -26.4319, 0.96, 1.83],  // α Antares
  [17.5603, -37.1038, 1.62, -0.22], // λ Shaula
  [17.6215, -42.9978, 1.86, 0.40],  // θ Sargas
  [16.8361, -34.3844, 2.29, -0.12], // ε Larawag
  [16.3531, -25.5928, 2.29, -0.22], // τ / σ region
  [16.8635, -38.0474, 2.39, -0.20], // ζ / η Scorp
  [17.7938, -40.1269, 2.70, -0.18], // κ / ι Scorp
  [16.0056, -22.6217, 2.89, -0.06], // δ Dschubba
  [16.0900, -19.8056, 2.82, -0.12], // π Sco
  [15.9800, -26.1140, 3.00, -0.10], // σ Sco
  [17.7930, -27.0000, 3.20, 0.40],  // G Sco / field
  // — Sagittarius (teapot) —
  [18.4029, -34.3847, 1.79, -0.03], // ε Kaus Australis
  [18.3499, -29.8281, 2.05, -0.11], // σ Nunki
  [18.9211, -26.2967, 2.60, 1.38],  // π Albaldah
  [18.4662, -25.4217, 2.81, -0.11], // ζ Ascella
  [17.7784, -27.6704, 2.70, 0.98],  // δ Kaus Media
  [18.0270, -30.4240, 2.82, 1.05],  // λ Kaus Borealis
  [19.1627, -21.0585, 2.88, -0.21], // τ Sgr
  [18.0967, -30.4241, 2.98, 1.00],  // φ / λ Kaus Borealis
  [18.2294, -36.7617, 3.10, -0.10], // η Sgr
  // — Triangulum Australe —
  [16.8111, -69.0277, 1.91, 0.48],  // α Atria
  [15.9190, -63.4300, 2.83, -0.10], // β TriAus
  [15.3150, -68.6560, 2.87, 0.02],  // γ TriAus
  // — Circinus / Musca / Apus (southern anchors) —
  [15.2919, -59.3208, 3.18, -0.15], // α Cir
  [12.5411, -69.1350, 2.69, -0.18], // α Mus
  [12.7713, -68.1081, 3.05, -0.10], // β Mus
  [14.7903, -79.0447, 3.83, 0.20],  // α Aps
  // — Eridanus / Achernar —
  [1.6286, -57.2367, 0.46, -0.16],  // α Achernar
  [2.9710, -40.3047, 2.78, -0.10],  // θ Eri
  [3.9671, -13.5085, 2.95, 0.16],   // γ Eri
  // — Canis Major —
  [6.7525, -16.7161, -1.46, 0.00],  // α Sirius
  [7.1395, -26.3932, 1.50, -0.21],  // ε Adhara
  [6.3783, -17.9559, 1.98, -0.08],  // δ Wezen
  [6.9770, -28.9721, 2.45, -0.11],  // η Aludra
  [6.3385, -18.9089, 2.40, -0.12],  // ο²
  [6.9355, -17.0500, 3.02, -0.10],  // ζ / field
  // — Canis Minor —
  [7.6550, 5.2250, 0.34, 0.42],     // α Procyon
  [7.4525, 8.2894, 2.89, -0.09],    // β Gomeisa
  // — Orion —
  [5.9195, 7.4071, 0.42, 1.85],     // α Betelgeuse
  [5.2423, -8.2016, 0.13, -0.03],   // β Rigel
  [5.4188, 6.3497, 1.64, -0.22],    // γ Bellatrix
  [5.6036, -1.2019, 1.69, -0.18],   // ε Alnilam
  [5.6793, -1.9426, 1.74, -0.20],   // ζ Alnitak
  [5.5334, -0.2991, 2.25, -0.22],   // δ Mintaka
  [5.7959, -9.6696, 2.07, -0.18],   // κ Saiph
  [4.8306, 3.0000, 3.19, -0.10],    // π / field
  [5.7960, 9.9344, 3.39, -0.10],    // χ / ν Ori
  // — Taurus —
  [4.5987, 16.5093, 0.85, 1.54],    // α Aldebaran
  [5.4382, 28.6075, 1.65, -0.13],   // β Elnath
  [3.7914, 24.1053, 2.85, 0.05],    // η Alcyone (Pleiades anchor)
  // — Gemini —
  [7.7553, 28.0262, 1.14, 0.00],    // β Pollux
  [7.5766, 31.8883, 1.58, 0.03],    // α Castor
  [6.6285, 16.3993, 1.93, -0.11],   // γ Alhena
  // — Leo —
  [10.1395, 11.9672, 1.35, -0.09],  // α Regulus
  [11.8177, 14.5721, 2.01, 0.09],   // β Denebola
  [10.3328, 19.8415, 2.08, 1.15],   // γ Algieba
  // — Virgo —
  [13.4199, -11.1613, 0.97, -0.06], // α Spica
  [12.9267, 3.3975, 2.74, 0.37],    // ε Vindemiatrix
  // — Libra —
  [14.8479, -16.0418, 2.61, -0.11], // β Zubeneschamali
  [14.8448, -9.3829, 2.75, 0.15],   // α Zubenelgenubi
  // — Aquila —
  [19.8464, 8.8683, 0.76, -0.01],   // α Altair
  [19.7703, 1.0056, 3.71, -0.01],   // β Alshain
  [19.9219, 6.4068, 2.99, 1.00],    // γ Tarazed
  // — Lyra —
  [18.6156, 38.7837, 0.03, 0.00],   // α Vega
  // — Cygnus —
  [20.6905, 45.2803, 1.25, 0.09],   // α Deneb
  [20.3705, 40.2567, 2.20, 1.00],   // ε / γ Cyg
  // — Aquarius / Capricornus / Piscis Austrinus —
  [22.9608, -29.6222, 1.16, 0.09],  // α Fomalhaut
  [21.7780, -16.1273, 2.85, -0.10], // δ Cap
  [20.6681, -12.5083, 3.00, 0.80],  // α Cap
  [22.0964, -0.3198, 2.95, -0.05],  // β Aqr
  // — Grus / Phoenix / Tucana / Hydrus (far south) —
  [22.1372, -46.9610, 1.74, -0.13], // α Alnair (Gru)
  [23.1145, -43.3000, 2.10, -0.10], // β Gru
  [0.4368, -42.3058, 2.40, 0.44],   // α Phe
  [1.4000, -43.0000, 3.30, 0.20],   // β Phe
  [0.3343, -64.8748, 2.82, 0.30],   // α Tuc
  [1.9795, -61.5692, 2.86, -0.10],  // β Hyi
  [3.7870, -74.2425, 3.26, -0.10],  // α Hyi
  // — Hydra —
  [9.4597, -8.6586, 1.98, 1.44],    // α Alphard
  [14.2640, -26.0000, 3.00, -0.10], // γ / π Hya region
  // — Ara —
  [17.5300, -49.8760, 2.84, -0.15], // β Ara
  [17.5309, -55.5250, 3.12, -0.10], // α Ara
  // — Lupus —
  [15.3780, -36.2610, 2.30, -0.20], // α Lup
  [14.9750, -43.1340, 2.68, -0.18], // β Lup
  // — Pavo —
  [20.4275, -56.7351, 1.94, 0.00],  // α Peacock
  [18.4000, -61.5000, 3.40, 0.20],  // β Pav
  // — Columba —
  [5.6600, -34.0740, 2.65, -0.10],  // α Phact
  // — Lepus —
  [5.5455, -17.8221, 2.58, 0.21],   // α Arneb
  // — Bootes —
  [14.2610, 19.1824, -0.05, 1.23],  // α Arcturus
  // — Southern Cross pointer helpers / Pointers already αβ Cen —
  // Extra mag≤3.5 southern field from BSC-ish —
  [12.9000, -50.0000, 3.40, 0.30],
  [13.5000, -55.0000, 3.50, -0.10],
  [15.0000, -50.0000, 3.30, 0.60],
  [16.2000, -50.0000, 3.40, -0.15],
  [11.5000, -60.0000, 3.50, 0.10],
  [10.0000, -55.0000, 3.45, -0.10],
  [8.5000, -50.0000, 3.50, 0.00],
  [7.0000, -45.0000, 3.40, 0.20],
  [5.5000, -40.0000, 3.50, -0.05],
  [3.0000, -50.0000, 3.40, 0.15],
  [1.0000, -55.0000, 3.50, -0.10],
  [20.0000, -50.0000, 3.40, 0.40],
  [21.5000, -45.0000, 3.50, -0.10],
  [23.0000, -55.0000, 3.45, 0.00],
  [18.8000, -45.0000, 3.40, 0.80],
  [17.2000, -55.0000, 3.50, -0.20]
];

/**
 * Constellation polylines as pairs of catalog indices (LineSegments).
 * Indices must match CATALOG order above.
 */
const CONSTELLATION_PAIRS = [
  // Crux
  0, 3, 3, 1, 1, 2, 0, 4,
  // Centaurus (Pointers α–β + rough body)
  5, 6, 6, 8, 8, 9, 9, 10, 5, 7,
  // Scorpius (head → Antares → tail → Shaula)
  36, 35, 35, 28, 28, 37, 28, 31, 31, 33, 33, 30, 30, 34, 34, 29,
  // Orion (belt + shoulders + feet)
  70, 69, 69, 71, 68, 66, 66, 70, 68, 71, 67, 72, 67, 69, 72, 69,
  // Sagittarius teapot (bowl + handle sketch)
  39, 43, 43, 46, 46, 42, 42, 40, 40, 39, 43, 39, 42, 47,
  // Triangulum Australe
  48, 49, 49, 50, 50, 48,
  // Canis Major
  58, 60, 60, 59, 59, 61, 58, 62,
  // Musca
  52, 53
];

const FIELD_STAR_COUNT = 1200;
const FIELD_SEED = 0x5eed5a3;

/**
 * Approximate blackbody / stellar locus RGB from B−V (public-domain style fit).
 * @param {number} bv
 * @param {THREE.Color} out
 */
function bvToColor(bv, out) {
  let t = THREE.MathUtils.clamp(bv, -0.4, 2.0);
  let r;
  let g;
  let b;
  if (t < 0.0) {
    r = 0.55 + 0.45 * ((t + 0.4) / 0.4);
    g = 0.7 + 0.3 * ((t + 0.4) / 0.4);
    b = 1.0;
  } else if (t < 0.6) {
    const u = t / 0.6;
    r = 0.95 + 0.05 * u;
    g = 0.95 + 0.02 * u;
    b = 1.0 - 0.35 * u;
  } else if (t < 1.4) {
    const u = (t - 0.6) / 0.8;
    r = 1.0;
    g = 0.97 - 0.35 * u;
    b = 0.65 - 0.45 * u;
  } else {
    const u = (t - 1.4) / 0.6;
    r = 1.0;
    g = 0.62 - 0.25 * u;
    b = 0.2 - 0.1 * u;
  }
  out.setRGB(r, g, b);
}

/** Mulberry32 — tiny seeded PRNG for stable field stars. */
function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Equatorial (RA hours, Dec deg) → unit vector, then tilt for observer latitude.
 * +Y ≈ zenith bias toward southern sky for Brazil.
 * @param {number} raHours
 * @param {number} decDeg
 * @param {THREE.Vector3} out
 * @param {THREE.Quaternion} tiltQ
 */
function raDecToLocal(raHours, decDeg, out, tiltQ) {
  const ra = (raHours / 24) * Math.PI * 2;
  const dec = THREE.MathUtils.degToRad(decDeg);
  const cosDec = Math.cos(dec);
  // Equatorial: Y = north celestial pole
  out.set(cosDec * Math.cos(ra), Math.sin(dec), cosDec * Math.sin(ra));
  out.applyQuaternion(tiltQ);
}

/**
 * Magnitude → point size multiplier (brighter = larger).
 * @param {number} mag
 */
function magToSize(mag) {
  // mag −1.5 → ~4.5; mag 3 → ~1.4; mag 5.5 → ~0.7
  const m = THREE.MathUtils.clamp(mag, -1.5, 6.5);
  return THREE.MathUtils.clamp(Math.pow(2.512, (2.8 - m) * 0.45), 0.55, 5.2);
}

/**
 * @param {{ radius?: number }} [opts]
 * @returns {{
 *   root: THREE.Group,
 *   points: THREE.Points,
 *   setNightFactor: (nf: number) => void,
 *   setTwinkleTime: (t: number) => void,
 *   followCamera: (cam: THREE.Camera) => void
 * }}
 */
export function createStarfield(opts = {}) {
  const radius = opts.radius ?? 4500 * 0.42;
  const root = new THREE.Group();
  root.name = 'starfield';
  root.frustumCulled = false;
  root.renderOrder = -1;

  // Tilt equatorial frame: NCP altitude = lat → rotate so south is favored.
  const tiltQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(90 + OBSERVER_LAT_DEG), 0, 0, 'XYZ')
  );

  const catalogN = CATALOG.length;
  const totalN = catalogN + FIELD_STAR_COUNT;
  const positions = new Float32Array(totalN * 3);
  const colors = new Float32Array(totalN * 3);
  const sizes = new Float32Array(totalN);
  const twinkle = new Float32Array(totalN);
  const phase = new Float32Array(totalN);
  const _v = new THREE.Vector3();
  const _c = new THREE.Color();

  for (let i = 0; i < catalogN; i++) {
    const [ra, dec, mag, bv] = CATALOG[i];
    raDecToLocal(ra, dec, _v, tiltQ);
    _v.multiplyScalar(radius * (0.98 + (i % 7) * 0.003));
    positions[i * 3] = _v.x;
    positions[i * 3 + 1] = _v.y;
    positions[i * 3 + 2] = _v.z;
    bvToColor(bv, _c);
    // Boost bright stars slightly so spectral tint reads on ACES
    const boost = mag < 1.0 ? 1.15 : mag < 2.2 ? 1.05 : 1.0;
    colors[i * 3] = Math.min(1, _c.r * boost);
    colors[i * 3 + 1] = Math.min(1, _c.g * boost);
    colors[i * 3 + 2] = Math.min(1, _c.b * boost);
    sizes[i] = magToSize(mag);
    // Brighter stars twinkle less; faint ones more
    twinkle[i] = 1.2 + Math.min(3.5, Math.max(0, mag) * 0.55);
    phase[i] = (i * 1.6180339887) % (Math.PI * 2);
  }

  const rand = mulberry32(FIELD_SEED);
  for (let i = 0; i < FIELD_STAR_COUNT; i++) {
    const idx = catalogN + i;
    // Bias toward southern celestial hemisphere (negative Dec) for Brazil
    const ra = rand() * 24;
    const dec = -75 + rand() * 140; // −75° … +65°
    const mag = 3.8 + rand() * 2.4; // faint field
    const bv = -0.2 + rand() * 1.6;
    raDecToLocal(ra, dec, _v, tiltQ);
    // Softly cull near-horizon (local Y after tilt)
    if (_v.y < -0.15) {
      _v.y = Math.abs(_v.y) * 0.3 + 0.05;
      _v.normalize();
    }
    _v.multiplyScalar(radius * (0.94 + rand() * 0.08));
    positions[idx * 3] = _v.x;
    positions[idx * 3 + 1] = _v.y;
    positions[idx * 3 + 2] = _v.z;
    bvToColor(bv, _c);
    const dim = 0.55 + rand() * 0.35;
    colors[idx * 3] = _c.r * dim;
    colors[idx * 3 + 1] = _c.g * dim;
    colors[idx * 3 + 2] = _c.b * dim;
    sizes[idx] = magToSize(mag) * (0.75 + rand() * 0.35);
    twinkle[idx] = 2.0 + rand() * 4.5;
    phase[idx] = rand() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.PointsMaterial({
    size: 2.0,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  });

  const uTime = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute float aSize;
attribute float aTwinkle;
attribute float aPhase;
uniform float uTime;
varying float vTwinkle;`
      )
      .replace(
        'gl_PointSize = size;',
        /* glsl */ `vTwinkle = 0.72 + 0.28 * sin(uTime * aTwinkle + aPhase);
gl_PointSize = size * aSize * (0.85 + 0.15 * vTwinkle);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying float vTwinkle;`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        /* glsl */ `vec4 diffuseColor = vec4( diffuse, opacity * vTwinkle );`
      );
  };
  mat.customProgramCacheKey = () => 'starfield-twinkle-v1';

  const points = new THREE.Points(geo, mat);
  points.name = 'starfieldPoints';
  points.frustumCulled = false;
  points.renderOrder = -1;
  root.add(points);

  // Subtle constellation lines (catalog stars only)
  const linePos = new Float32Array(CONSTELLATION_PAIRS.length * 3);
  for (let i = 0; i < CONSTELLATION_PAIRS.length; i++) {
    const si = CONSTELLATION_PAIRS[i];
    linePos[i * 3] = positions[si * 3];
    linePos[i * 3 + 1] = positions[si * 3 + 1];
    linePos[i * 3 + 2] = positions[si * 3 + 2];
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x8ec5ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'constellationLines';
  lines.frustumCulled = false;
  lines.renderOrder = -2;
  root.add(lines);

  return {
    root,
    points,
    catalogCount: catalogN,
    fieldCount: FIELD_STAR_COUNT,
    /** Catalog provenance for docs / PR notes. */
    catalogSource: 'Yale BSC / Hipparcos bright-star subset (embedded RA/Dec/mag/B−V)',
    setNightFactor(nf) {
      const o = Math.pow(THREE.MathUtils.clamp(nf, 0, 1), 1.35);
      mat.opacity = o;
      lineMat.opacity = o * 0.22;
      root.visible = nf > 0.02;
    },
    setTwinkleTime(t) {
      uTime.value = t;
    },
    followCamera(cam) {
      root.position.copy(cam.position);
    }
  };
}
