/**
 * main.js — Entry point for the City project.
 *
 * Bootstraps all modules and starts the game loop.
 * This is the ONLY file that knows about all the other modules.
 */

import * as THREE from 'three';
import { Renderer } from './engine/Renderer.js';
import { GameLoop } from './engine/GameLoop.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MouseInput } from './input/MouseInput.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { PorscheModel } from './vehicle/PorscheModel.js';
import { VehicleController } from './vehicle/VehicleController.js';
import { Intersection } from './world/Intersection.js';
import { createCityStream, STREAM_STEP } from './world/registerCity.js';
import { loadSession, bindSessionAutosave } from './engine/SessionState.js';
import { dumpLoadLog, getHitchRevision, getTopLoadHitches, getTopPlayHitches, getLoadPhase, setLoadPhase, setInteractive, getStreamLabel } from './engine/loadLog.js';
import { initRingLoadHud } from './engine/ringLoadHud.js';
import { waitUntilSmooth, yieldToMain } from './world/yield.js';
import { loadGovernor } from './engine/LoadGovernor.js';
import { isInsideCity } from './world/RoadDimensions.js';
import { tickWind } from './world/terrain/windMaterial.js';
import { tickWater } from './world/water/registerLakes.js';
import { ensureGroundAround } from './world/terrain/terrainCollision.js';
import { surfaceY } from './world/terrain/paths.js';
import { initTerrainDebug } from './world/terrain/terrainDebug.js';

async function startGame() {
  setLoadPhase('boot');
  // ── Engine ──────────────────────────────────────────────────────────
  const canvas = document.getElementById('game-canvas');
  const renderer = new Renderer(canvas);

  // ── Lighting ────────────────────────────────────────────────────────
  setupLighting(renderer.scene);

  // ── Physics ─────────────────────────────────────────────────────────
  const physicsWorld = new PhysicsWorld();

  // ── World (all city geometry) ───────────────────────────────────────
  const cityGroup = new THREE.Group();
  renderer.scene.add(cityGroup);

  await new Intersection().build(cityGroup);

  const saved = loadSession();
  const originX = saved?.car?.x ?? 0;
  const originZ = saved?.car?.z ?? 4.0;

  const porscheModel = new PorscheModel();
  const stream = createCityStream(cityGroup, physicsWorld, originX, originZ, renderer);

  await porscheModel.load();
  renderer.scene.add(porscheModel.chassisGroup);

  const keyboard = new KeyboardInput();
  const mouse = new MouseInput();
  const vehicleController = new VehicleController(physicsWorld, porscheModel, keyboard);
  const camera = new ThirdPersonCamera(renderer.camera, renderer.renderer, keyboard);
  camera.setMouseInput(mouse);

  if (saved) {
    vehicleController.applyPose(saved.car);
    if (!isInsideCity(saved.car.x, saved.car.z)) {
      vehicleController.resetPosition();
    }
    porscheModel.chassisGroup.position.copy(vehicleController.chassisBody.position);
    porscheModel.chassisGroup.quaternion.copy(vehicleController.chassisBody.quaternion);
    mouse.applyState(saved.camera);
    camera.applyState(saved.camera, porscheModel.chassisGroup, mouse);
  }

  bindSessionAutosave(vehicleController, mouse, camera);

  const speedValueElement = document.getElementById('speed-value');
  const fpsValue = document.getElementById('fps-value');
  const loadValue = document.getElementById('load-value');
  const loadFill = document.getElementById('load-fill');
  const loadDetail = document.getElementById('load-detail');
  const hitchList = document.getElementById('hitch-list');
  const playHitchList = document.getElementById('play-hitch-list');
  const loadPhaseEl = document.getElementById('load-phase');
  let shownHitchRev = -1;
  const paintRingLoad = initRingLoadHud();

  function renderHitchList(el, rows) {
    if (!el) return;
    el.innerHTML = rows.length
      ? rows.map((h) => {
        const extra = h.programDelta > 0 ? ` +${h.programDelta}prog` : '';
        const work = (h.work || h.cause).length > 28
          ? `${(h.work || h.cause).slice(0, 26)}…`
          : (h.work || h.cause);
        return `<li><span class="hitch-ms">${h.frameMs}ms</span> <span class="hitch-md hitch-${h.md}">${h.md}</span> ${work}${extra}</li>`;
      }).join('')
      : '<li>nenhum ainda</li>';
  }

  // On-screen terrain mesh / collider inspector (button, or key M).
  const tickTerrainDebug = initTerrainDebug({
    scene: renderer.scene,
    getCarPosition: () => vehicleController.chassisBody.position
  });

  const gameLoop = new GameLoop((delta, elapsed) => {
    tickWind(elapsed);
    tickWater(elapsed, renderer.scene);

    // Ground under the car exists before physics needs it, even if the
    // visual stream has not reached this ring yet.
    const car = vehicleController.chassisBody.position;
    ensureGroundAround(car.x, car.z);
    rescueIfBelowGround(vehicleController);

    vehicleController.enabled = !camera.isFreeFlight;
    physicsWorld.step(delta);
    const speedMetersPerSecond = vehicleController.update(delta);
    camera.update(porscheModel.chassisGroup, mouse, delta);
    renderer.render();

    if (speedValueElement) {
      speedValueElement.textContent = Math.round(speedMetersPerSecond * 3.6);
    }
    if (fpsValue) fpsValue.textContent = Math.round(loadGovernor.instantFps);
    if (loadValue) loadValue.textContent = loadGovernor.loadPercent;
    if (loadFill) loadFill.style.width = `${loadGovernor.loadPercent}%`;
    if (loadDetail) {
      loadDetail.textContent =
        `batch ${loadGovernor.instanceBatch} · chunk ${loadGovernor.chunk} · ${loadGovernor.budgetMs.toFixed(0)}ms` +
        (loadGovernor.streaming ? ' · cap' : '');
    }
    tickTerrainDebug(elapsed);
    if (loadPhaseEl) {
      const stream = getStreamLabel();
      const phase = getLoadPhase();
      loadPhaseEl.textContent = stream && phase === 'play' ? `${phase} · ${stream}` : (stream || phase);
    }
    if ((hitchList || playHitchList) && getHitchRevision() !== shownHitchRev) {
      shownHitchRev = getHitchRevision();
      renderHitchList(hitchList, getTopLoadHitches(8));
      renderHitchList(playHitchList, getTopPlayHitches(8));
    }
    paintRingLoad();
  });

  gameLoop.start();

  // Present one stable frame (Porsche + intersection) before compile pause,
  // so pauseDraw has a real framebuffer to hold (no blank blue hold).
  await yieldToMain();

  // Porsche + corner markers (~13 programs) used to compile on the first
  // stream frame, tagged `stream ring 10 prio 0 +13prog`.
  renderer.pauseDraw();
  await renderer.compileSubtree(renderer.scene, { instancersOnly: false });
  renderer.resumeDraw();
  await yieldToMain();

  // Solid countryside under and around the spawn from frame one.
  ensureGroundAround(originX, originZ, 80, 25);

  // Capture freezes as soon as the player can move / fly.
  setInteractive(true);
  setLoadPhase('play');
  loadGovernor.streaming = true;
  stream.pumpTo(STREAM_STEP, 0)
    .then(() => {
      // World is already interactive — FPS hitch list captures every freeze
      // from here on, even while hinterland keeps streaming.
      setLoadPhase('play');
      setInteractive(true);
      // Terrain mesh circle first (far vista), phys stays under the car.
      return stream.pumpTerrainTo(STREAM_STEP);
    })
    .then(() => {
      setLoadPhase('play');
      setInteractive(true);
      return stream.continueAfter(STREAM_STEP);
    })
    .then(async () => {
      loadGovernor.streaming = false;
      await waitUntilSmooth(40, 60);
      await renderer.resumeShadows();
      setLoadPhase('play');
      dumpLoadLog();
    })
    .catch((error) => {
      console.error('City stream failed:', error);
    });

  console.log('🏙️ City started successfully!');
}

/**
 * Safety net: if the car ends up well under the terrain (a collider that was
 * still streaming, or a bad respawn), lift it back onto the surface.
 */
function rescueIfBelowGround(vehicleController) {
  const body = vehicleController.chassisBody;
  const ground = surfaceY(body.position.x, body.position.z);
  if (body.position.y > ground - 4) return;
  body.position.y = ground + 2;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.wakeUp();
}

function setupLighting(scene) {
  // Hemisphere light (sky + ground)
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2);
  hemisphereLight.position.set(0, 50, 0);
  scene.add(hemisphereLight);

  // Directional sun light with shadows
  const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
  sunLight.position.set(20, 140, 20);
  sunLight.target.position.set(90, 0, 90);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 420;
  sunLight.shadow.camera.left = -160;
  sunLight.shadow.camera.right = 160;
  sunLight.shadow.camera.top = 160;
  sunLight.shadow.camera.bottom = -160;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target);
}

// ── Start ───────────────────────────────────────────────────────────────
startGame().catch((error) => {
  console.error('Failed to start city:', error);
});
