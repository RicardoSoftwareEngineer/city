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
import { createCityStream, registerNearCampo, registerHeavyWorld, STREAM_STEP } from './world/registerCity.js';
import { loadSession, bindSessionAutosave } from './engine/SessionState.js';
import { dumpLoadLog, getHitchRevision, getTopLoadHitches, getTopPlayHitches, getLoadPhase, setLoadPhase, setInteractive, getStreamLabel, getSessionStats } from './engine/loadLog.js';
import { createQualityAdapter } from './engine/qualityAdapter.js';
import { bindQualityPresetUi, getActivePreset } from './engine/qualityPresets.js';
import { initRingLoadHud } from './engine/ringLoadHud.js';
import { initLoadOrderHud } from './engine/loadOrderHud.js';
import { initMinimizableHud } from './engine/minimizableHud.js';
import { initResourceHud } from './engine/resourceHud.js';
import { beginLoadPhase, endLoadPhase, endGroundPhysPhase, finishAllLoadPhases, noteGroundPhys } from './engine/loadOrderLog.js';
import { bindValveDraw, waitUntilSmooth, yieldToMain, throughValve } from './world/yield.js';
import { memoryGuardian, PHYS_PIN_RADIUS } from './engine/memoryGuardian.js';
import { createFocusGrid } from './engine/focusGrid.js';
import { setFocusCellKey, armFocusRemain } from './engine/focusRemain.js';
import { loadGovernor } from './engine/LoadGovernor.js';
import {
  isInsideCity,
  CITY_PAVED_MIN,
  CITY_PAVED_MAX,
  ASPHALT_SURFACE_Y
} from './world/RoadDimensions.js';
import { tickWind } from './world/terrain/windMaterial.js';
import { tickWater } from './world/water/registerLakes.js';
import { ensureGroundAround, setTerrainPhysics, TERRAIN_TILE, GRID_OFFSET } from './world/terrain/terrainCollision.js';
import { surfaceY } from './world/terrain/paths.js';
import { ensureWhiteOrchardHeightmap } from './world/terrain/whiteOrchardHeight.js';
import { initTerrainDebug } from './world/terrain/terrainDebug.js';
import { initRadiusDebug } from './engine/radiusDebug.js';
import { initPersonaHud } from './engine/personaHud.js';
import { clearAssetDiskCache, assetDiskCacheCount } from './engine/assetDiskCache.js';
import { clearGltfMemoryDedupe } from './world/AssetLoader.js';
import { ApartmentDirector } from './world/apartments/ApartmentDirector.js';

/** Predicted stream focus = car + planar velocity × this many seconds (spec 02). */
const PREDICT_FOCUS_HORIZON = 2.5;

async function startGame() {
  setLoadPhase('boot');
  // Prefetch orchard heightmap during boot UI — mesh samples need it ready.
  void ensureWhiteOrchardHeightmap();
  // ── Engine ──────────────────────────────────────────────────────────
  const canvas = document.getElementById('game-canvas');
  const renderer = new Renderer(canvas);
  // Draw pause hooks for compileSubtree — stream Valve no longer HOLDs for FPS.
  bindValveDraw({
    pause: () => renderer.pauseDraw(),
    resume: () => renderer.resumeDraw()
  });

  // ── Lighting ────────────────────────────────────────────────────────
  setupLighting(renderer.scene);

  // ── Physics ─────────────────────────────────────────────────────────
  const physicsWorld = new PhysicsWorld();

  // ── World group + cheap boot visuals (sky already on Renderer) ──────
  const cityGroup = new THREE.Group();
  renderer.scene.add(cityGroup);
  addBootCityGround(cityGroup);

  const apartmentDirector = new ApartmentDirector({
    parent: cityGroup,
    renderer
  });
  window.__cityApartments = apartmentDirector;

  const saved = loadSession();
  const originX = saved?.car?.x ?? 0;
  const originZ = saved?.car?.z ?? 4.0;

  // Stream focus snaps to terrain-fine tiles — not every centimetre of the car.
  const focusGrid = createFocusGrid({
    cellSize: TERRAIN_TILE,
    offset: GRID_OFFSET,
    hysteresis: 8
  });

  // Minimal phys FIRST — pin Heightfield under spawn before any glTF / GPU compile.
  // City asphalt already has PhysicsWorld's flat ground box; this covers countryside spawn.
  setTerrainPhysics(physicsWorld);
  {
    const t0 = performance.now();
    const built = ensureGroundAround(originX, originZ, PHYS_PIN_RADIUS, 25);
    if (built) noteGroundPhys(built, `boot ${built} tile(s)`, performance.now() - t0);
    endGroundPhysPhase();
  }

  // Placeholder chassis so the player can move before porsche.glb arrives.
  const porscheModel = new PorscheModel();
  porscheModel.attachPlaceholder();
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
  const paintLoadOrder = initLoadOrderHud();
  const paintResources = initResourceHud({ getRenderer: () => renderer });
  const quality = createQualityAdapter(renderer);
  loadGovernor.quality = quality.label;
  bindQualityPresetUi((id) => {
    loadGovernor.quality = quality.label;
    memoryGuardian.tick();
    // Shadows: Ultra may need a bake; Simples turns them off in applyQualityPreset.
    if (getActivePreset().shadows && !renderer.renderer.shadowMap.enabled) {
      void renderer.resumeShadows();
    }
  });
  // Persona panels must exist in the DOM before minimizableHud binds them.
  const paintPersona = initPersonaHud({ getQuality: () => quality });
  initMinimizableHud();
  const tickRadiusDebug = initRadiusDebug(renderer.scene);
  const fpsSacredStats = document.getElementById('fps-sacred-stats');

  function renderHitchList(el, rows) {
    if (!el) return;
    el.innerHTML = rows.length
      ? rows.map((h) => {
        const extra = h.programDelta > 0 ? ` +${h.programDelta}prog` : '';
        const stream = h.stream ? ` · ${h.stream}` : '';
        const hold = h.holding ? ' · HOLD' : '';
        const draw = h.drawMs > 0 ? ` · draw${h.drawMs}` : '';
        const fps = h.fps ? ` · ${h.fps}fps` : '';
        const q = h.quality ? ` · q:${h.quality}` : '';
        const heap = h.heapMb > 0 ? ` · heap${h.heapMb}MB` : '';
        const tris = h.tris > 0 ? ` · ${(h.tris / 1000).toFixed(0)}ktri` : '';
        // Prefer cause when it is "after: …" — work alone hid that quality apply ≠ slow draw.
        let label = h.work && h.work !== 'none' ? h.work : h.cause;
        if (h.cause && String(h.cause).startsWith('after:') && h.cause !== h.work) {
          label = h.cause;
        }
        const work = label.length > 40 ? `…${label.slice(-38)}` : label;
        const recent = h.recent
          ? ` · <span class="hitch-recent" title="${h.recent}">…${h.recent.split(' ← ').pop()}</span>`
          : '';
        const bug = h.bug || h.frameMs > 1000 ? ' <span class="hitch-bug">BUG</span>' : '';
        return `<li><span class="hitch-ms">${h.frameMs}ms</span>${bug} <span class="hitch-md hitch-${h.md}">${h.md}</span> ${work}${extra}${stream}${hold}${draw}${fps}${q}${heap}${tris}${recent}</li>`;
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
    apartmentDirector.update(delta);

    // Phys pin follows the real car; stream/Guardian focus leads with velocity.
    const car = vehicleController.chassisBody.position;
    const vel = vehicleController.chassisBody.velocity;
    memoryGuardian.setCarPosition(car.x, car.z);
    const predX = car.x + vel.x * PREDICT_FOCUS_HORIZON;
    const predZ = car.z + vel.z * PREDICT_FOCUS_HORIZON;
    const focus = focusGrid.update(predX, predZ);
    setFocusCellKey(focus.key);
    memoryGuardian.setFocus(focus.x, focus.z);
    memoryGuardian.tick();
    {
      const t0 = performance.now();
      const builtGround = ensureGroundAround(car.x, car.z);
      if (builtGround) {
        noteGroundPhys(builtGround, `${builtGround} tile(s)`, performance.now() - t0);
      }
    }
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
    tickRadiusDebug(car);
    if (loadPhaseEl) {
      const stream = getStreamLabel();
      const phase = getLoadPhase();
      loadPhaseEl.textContent = stream && phase === 'play' ? `${phase} · ${stream}` : (stream || phase);
    }
    loadGovernor.quality = quality.label;

    if ((hitchList || playHitchList) && getHitchRevision() !== shownHitchRev) {
      shownHitchRev = getHitchRevision();
      renderHitchList(hitchList, getTopLoadHitches(12));
      renderHitchList(playHitchList, getTopPlayHitches(12));
    }
    if (fpsSacredStats) {
      const s = getSessionStats();
      const hold = loadGovernor.holding ? ' · <span class="hold-on">HOLD</span>' : '';
      const q = ` · <span class="q-temp">q:${quality.label}</span>`;
      fpsSacredStats.innerHTML =
        `gate ${Math.round(s.gateMs)}ms×${s.gateEnters}` +
        ` · compile ${s.compileCount}/${Math.round(s.compileMs)}ms` +
        ` · worst ${s.worstFrameMs || '—'}ms` +
        hold + q;
    }
    paintRingLoad();
    paintLoadOrder();
    paintResources();
    paintPersona();
  });

  // First paint ASAP — sky + boot ground + placeholder; phys already pinned.
  // Heavy work (Porsche glTF, Intersection, full stream, GPU compile) runs after.
  gameLoop.start();

  const clearCacheBtn = document.getElementById('clear-asset-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      const n = await assetDiskCacheCount();
      const ok = window.confirm(
        `Limpar cache de assets no disco? (${n} arquivo(s))\n` +
          'MemoryGuardian / cena ao vivo não são apagados. Recarrega depois.'
      );
      if (!ok) return;
      await clearAssetDiskCache();
      clearGltfMemoryDedupe();
      clearCacheBtn.textContent = 'Cache limpo';
      setTimeout(() => {
        clearCacheBtn.textContent = 'Limpar cache';
      }, 2000);
    });
  }

  const aptsBtn = document.getElementById('apts-load-btn');
  if (aptsBtn) {
    const labelApts = () => `Apts ${apartmentDirector.loadedCount()}`;
    aptsBtn.addEventListener('click', async () => {
      const car = vehicleController.chassisBody.position;
      const cam = camera.camera.position;
      // Prefer free-fly camera when active; otherwise car pose.
      const px = camera.isFreeFlight ? cam.x : car.x;
      const pz = camera.isFreeFlight ? cam.z : car.z;
      const facadeId = apartmentDirector.pickFacadeNear(px, pz);
      if (!facadeId) {
        aptsBtn.textContent = 'Sem fachada';
        setTimeout(() => { aptsBtn.textContent = 'Apts 3'; }, 1500);
        return;
      }
      aptsBtn.disabled = true;
      aptsBtn.textContent = 'Apts…';
      apartmentDirector.unload(facadeId);
      await apartmentDirector.loadCount(facadeId, 3);
      apartmentDirector.markFacadeHouse(facadeId);
      aptsBtn.textContent = labelApts();
      aptsBtn.title = `Apartamentos em: ${facadeId}`;
      aptsBtn.disabled = false;
    });
  }


  // Idle playable shell: phys pin + placeholder only. No city stream until click.
  setInteractive(true);
  setLoadPhase('idle');
  loadGovernor.streaming = false;
  {
    memoryGuardian.setCarPosition(originX, originZ);
    const focus = focusGrid.update(originX, originZ);
    setFocusCellKey(focus.key);
    memoryGuardian.setFocus(focus.x, focus.z);
  }
  memoryGuardian.tick();

  const startBtn = document.getElementById('start-load-btn');
  const bootGate = document.getElementById('boot-gate');

  async function beginCityLoad() {
    if (document.body.dataset.loading === '1') return;
    document.body.dataset.loading = '1';
    document.body.classList.remove('boot-idle');
    if (bootGate) bootGate.hidden = true;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Carregando…';
    }

    setLoadPhase('play');
    loadGovernor.streaming = true;
    {
      memoryGuardian.setCarPosition(originX, originZ);
      const focus = focusGrid.update(originX, originZ);
      setFocusCellKey(focus.key);
      memoryGuardian.setFocus(focus.x, focus.z);
    }
    memoryGuardian.tick();

    // Let the click paint "Carregando…" before sync job registration.
    await yieldToMain();

    // Corner markers — off critical path.
    void new Intersection().build(cityGroup);

    // Light jobs only — far veg/avenue/lakes wait for registerHeavyWorld.
    const stream = await createCityStream(cityGroup, physicsWorld, originX, originZ, renderer, apartmentDirector);
    await yieldToMain();

    // Progressive campo boot:
    // 1) terrain mesh bg (orchard elevation + biome tint on verts)
    // 2) near veg registration (sliced) overlapping spawn streets
    // 3) nature bg pump ignores soft-cap so first greens are not starved
    // 4) far veg + carpet after first street ring
    beginLoadPhase('spawn', 'r10 p0');
    beginLoadPhase('terrain', 'bg…');
    beginLoadPhase('nature', 'near…');
    stream.startTerrainBackground();
    const nearCampo = registerNearCampo(stream, cityGroup, originX, originZ).then(() => {
      stream.startNatureBackground();
    });
    const spawnStreets = stream.pumpTo(STREAM_STEP, 0).then(() => {
      endLoadPhase('spawn');
    });

    Promise.all([spawnStreets, nearCampo])
      .then(async () => {
        setLoadPhase('play');
        setInteractive(true);
        beginLoadPhase('nature', 'far…');
        await registerHeavyWorld(stream, cityGroup, originX, originZ, renderer.scene);
        await yieldToMain();
        stream.startNatureBackground();
        stream.startCarpetBackground();
        // Porsche after first ring — not competing with createCityStream on click.
        porscheModel.load()
          .then(async () => {
            await throughValve(() =>
              renderer.compileSubtree(porscheModel.chassisGroup, { instancersOnly: false })
            );
          })
          .catch((error) => {
            console.error('Porsche load failed:', error);
          });
        // Keep terrain + nature + carpet phases alive — they end themselves when idle.
        finishAllLoadPhases(['terrain', 'nature', 'carpet']);
        armFocusRemain();
        setLoadPhase('play');
        setInteractive(true);
        await waitUntilSmooth();
        if (getActivePreset().shadows) {
          await renderer.resumeShadows();
        }
        return stream.continueAfter(STREAM_STEP);
      })
      .catch((error) => {
        console.error('City stream failed:', error);
      });

    console.log('🏙️ City load started by user (progressive campo)');
  }

  if (startBtn) {
    startBtn.addEventListener('click', beginCityLoad);
  } else {
    // Fallback if markup missing — do not leave the world empty forever.
    beginCityLoad();
  }

  console.log('🏙️ Boot idle — waiting for Começar a carregar');
}

/**
 * Flat paved-rect stand-in so first frames show ground (not only sky).
 * Street glTFs draw on top; phys uses PhysicsWorld's city box + Heightfields.
 */
function addBootCityGround(parent) {
  const size = CITY_PAVED_MAX - CITY_PAVED_MIN;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ color: 0x3f3f46 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(
    (CITY_PAVED_MIN + CITY_PAVED_MAX) * 0.5,
    ASPHALT_SURFACE_Y + 0.02,
    (CITY_PAVED_MIN + CITY_PAVED_MAX) * 0.5
  );
  mesh.name = 'boot-city-ground';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
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
