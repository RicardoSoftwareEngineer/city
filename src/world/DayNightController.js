/**
 * DayNightController — Sky + sun orbit + hemi/sun/moon lights + starfield.
 *
 * Time mapping (t ∈ [0, 1]):
 *   0.00 = midnight
 *   0.25 = sunrise (sun on horizon, east-ish)
 *   0.50 = noon
 *   0.75 = sunset
 *   1.00 = midnight again
 *
 * Elevation = sin((t − 0.25) · 2π) · 90° — matches the labels above.
 * Owns Sky dome, sun/moon DirectionalLights, HemisphereLight, rich starfield
 * (catalog Points + constellation lines), toneMappingExposure. No PMREM.
 * No @takram/three-atmosphere. No Milky Way nebula.
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createStarfield } from './starfield.js';

const SKY_SCALE = 4500;
/** Sky dome sunPosition distance (visual only). */
const SUN_DISTANCE = 400;
/**
 * Shadow-casting DirectionalLight distance along sunDir from target.
 * Pre-#141 light sat ~172 from target; keeping ~180 avoids noon/afternoon
 * ground sitting at/beyond shadow.camera.far when the light was at 400.
 */
const LIGHT_DISTANCE = 180;
/** Ortho shadow far with headroom for afternoon ground past the target. */
const SHADOW_CAMERA_FAR = 700;
/** Rebake while auto-playing at most every N apply ticks (hitch-friendly). */
const SHADOW_REBAKE_PLAY_FRAMES = 30;
/** Dot threshold (~1.8°) — rebake sooner if the sun jumped. */
const SHADOW_REBAKE_DOT = 0.9995;
/** Default: noon. */
const DEFAULT_T = 0.5;
/** Full day cycle length when auto-play is on (seconds). Slow for demo. */
const DEFAULT_DAY_SECONDS = 240;

const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();
const _colNoon = new THREE.Color(0xfffbeb);
const _colDusk = new THREE.Color(0xff9a5c);
const _colWarm = new THREE.Color(0xfff4e0);
const _colHemiDay = new THREE.Color(0xffffff);
const _colHemiDusk = new THREE.Color(0xb8c8e0);
const _colHemiNight = new THREE.Color(0x1a2740);
const _colHemiSky = new THREE.Color();
const _colGroundDay = new THREE.Color(0x94a3b8);
const _colGroundNight = new THREE.Color(0x1e293b);

/**
 * @param {{
 *   scene: THREE.Scene,
 *   renderer: THREE.WebGLRenderer,
 *   camera?: THREE.Camera,
 *   target?: THREE.Vector3,
 * }} opts
 */
export function createDayNightController(opts) {
  const { scene, renderer } = opts;
  const camera = opts.camera || null;
  const target = (opts.target || new THREE.Vector3(90, 0, 90)).clone();

  // Replace solid sky color with Sky dome.
  scene.background = null;

  const sky = new Sky();
  sky.name = 'dayNightSky';
  sky.scale.setScalar(SKY_SCALE);
  scene.add(sky);

  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 1.2;
  uniforms.mieCoefficient.value = 0.005;
  uniforms.mieDirectionalG.value = 0.8;
  if (uniforms.showSunDisc) uniforms.showSunDisc.value = 1;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2);
  hemi.name = 'hemiLight';
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
  sunLight.name = 'sunLight';
  sunLight.userData.isSun = true;
  sunLight.target.position.copy(target);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = SHADOW_CAMERA_FAR;
  sunLight.shadow.camera.left = -160;
  sunLight.shadow.camera.right = 160;
  sunLight.shadow.camera.top = 160;
  sunLight.shadow.camera.bottom = -160;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Cool moon fill — light only (+ optional pale disc). Shadows stay on the sun.
  const moonLight = new THREE.DirectionalLight(0xa8c4e8, 0);
  moonLight.name = 'moonLight';
  moonLight.userData.isMoon = true;
  moonLight.castShadow = false;
  moonLight.target.position.copy(target);
  scene.add(moonLight);
  scene.add(moonLight.target);

  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(18, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0
    })
  );
  moonDisc.name = 'moonDisc';
  moonDisc.frustumCulled = false;
  scene.add(moonDisc);

  // NASA LROC 2k color map — color near-white so the map shows; night fade via opacity.
  new THREE.TextureLoader().load(
    '/textures/moon/lroc_color_2k.jpg',
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      moonDisc.material.map = texture;
      moonDisc.material.needsUpdate = true;
    }
  );

  const starfield = createStarfield({ radius: SKY_SCALE * 0.42 });
  const stars = starfield.root;
  scene.add(stars);
  let t = DEFAULT_T;
  let playing = false;
  let daySeconds = DEFAULT_DAY_SECONDS;
  const sunDirection = new THREE.Vector3(0.707, 0.707, 0);
  const lastShadowBakeDir = new THREE.Vector3();
  let forceShadowBake = false;
  let framesSinceShadowBake = 0;

  function setTime(next) {
    t = ((Number(next) % 1) + 1) % 1;
    forceShadowBake = true;
    apply();
  }

  function getTime() {
    return t;
  }

  function setPlaying(on) {
    playing = Boolean(on);
  }

  function isPlaying() {
    return playing;
  }

  function tick(dt) {
    if (playing && dt > 0 && Number.isFinite(dt)) {
      t = (t + dt / daySeconds) % 1;
    }
    // Continuous wall clock — immune to pauseDraw dt hitches / accumulator resets.
    starfield.setTwinkleTime(performance.now() * 0.001);
    apply();
  }

  function getSunDirection() {
    return sunDirection;
  }

  function apply() {
    // Elevation degrees: −90 midnight … 0 sunrise … +90 noon … 0 sunset.
    const elevationDeg = Math.sin((t - 0.25) * Math.PI * 2) * 90;
    // Azimuth sweeps over the day (degrees from +Z toward +X).
    const azimuthDeg = t * 360 - 90;

    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    _sunDir.setFromSphericalCoords(1, phi, theta);

    uniforms.sunPosition.value.copy(_sunDir).multiplyScalar(SUN_DISTANCE);

    // Mild turbidity bump near horizon (sunrise/sunset).
    const horizon = 1 - Math.min(1, Math.abs(elevationDeg) / 25);
    uniforms.turbidity.value = 3.5 + horizon * 4;
    uniforms.rayleigh.value = 1.0 + horizon * 0.8;

    // Shadow light closer than Sky sunPosition so ground stays inside near/far.
    sunLight.position.copy(target).addScaledVector(_sunDir, LIGHT_DISTANCE);
    sunLight.target.position.copy(target);
    sunLight.target.updateMatrixWorld();

    // Day / night factors from sun height (smooth around horizon).
    const sunY = _sunDir.y;
    const dayFactor = THREE.MathUtils.smoothstep(sunY, -0.05, 0.2);
    const nightFactor = 1 - dayFactor;

    if (sunY > 0.35) {
      sunLight.color.copy(_colNoon);
    } else if (sunY > 0) {
      sunLight.color.copy(_colNoon).lerp(_colDusk, 1 - sunY / 0.35);
    } else {
      sunLight.color.copy(_colDusk).lerp(_colWarm, nightFactor);
    }
    sunLight.intensity = 0.05 + dayFactor * 2.15;

    // Shadows only while the sun is a meaningful light (community pattern).
    const wantShadow = dayFactor > 0.25;
    if (sunLight.castShadow !== wantShadow) {
      sunLight.castShadow = wantShadow;
      if (wantShadow && renderer.shadowMap.enabled) {
        forceShadowBake = true;
      }
    }

    // autoUpdate=false after resumeShadows — rebake when the sun pose moves.
    if (renderer.shadowMap.enabled && sunLight.castShadow) {
      framesSinceShadowBake++;
      const moved =
        lastShadowBakeDir.lengthSq() < 1e-6 ||
        lastShadowBakeDir.dot(_sunDir) < SHADOW_REBAKE_DOT;
      const playDue = playing && (moved || framesSinceShadowBake >= SHADOW_REBAKE_PLAY_FRAMES);
      if (forceShadowBake || playDue) {
        renderer.shadowMap.needsUpdate = true;
        lastShadowBakeDir.copy(_sunDir);
        framesSinceShadowBake = 0;
        forceShadowBake = false;
      }
    } else {
      forceShadowBake = false;
      framesSinceShadowBake = 0;
    }

    _colHemiSky.copy(_colHemiDay).lerp(_colHemiNight, nightFactor * 0.85);
    if (dayFactor < 0.5) _colHemiSky.lerp(_colHemiDusk, (1 - dayFactor) * 0.35);
    hemi.color.copy(_colHemiSky);
    hemi.groundColor.copy(_colGroundDay).lerp(_colGroundNight, nightFactor);
    hemi.intensity = 0.25 + dayFactor * 0.95;

    // Moon opposite the sun, faint cool fill when sun is down.
    _moonDir.copy(_sunDir).multiplyScalar(-1);
    if (_moonDir.y < 0.05) _moonDir.y = Math.abs(_moonDir.y) * 0.35 + 0.15;
    _moonDir.normalize();
    moonLight.position.copy(target).addScaledVector(_moonDir, SUN_DISTANCE);
    moonLight.target.position.copy(target);
    moonLight.target.updateMatrixWorld();
    moonLight.intensity = nightFactor * 0.35;
    moonLight.color.set(0xa8c4e8);

    moonDisc.position.copy(target).addScaledVector(_moonDir, SUN_DISTANCE * 0.85);
    moonDisc.visible = nightFactor > 0.05;
    moonDisc.material.opacity = Math.min(1, nightFactor * 1.2);

    starfield.setNightFactor(nightFactor);
    starfield.setSiderealTime(t);
    if (camera) starfield.followCamera(camera);

    // Exposure: brighter noon, darker night (ACES kept on renderer).
    renderer.toneMappingExposure = 0.55 + dayFactor * 0.55;

    sunDirection.copy(_sunDir).normalize();
  }

  apply();

  return {
    sky,
    sunLight,
    moonLight,
    hemi,
    stars,
    starfield,
    setTime,
    getTime,
    tick,
    setPlaying,
    isPlaying,
    getSunDirection,
    /** Hours in [0, 24). */
    getHours() {
      return t * 24;
    },
    setHours(h) {
      setTime(((Number(h) % 24) + 24) % 24 / 24);
    },
    setDaySeconds(s) {
      if (s > 0) daySeconds = s;
    }
  };
}

