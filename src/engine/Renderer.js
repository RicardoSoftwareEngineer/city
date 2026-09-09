/**
 * Renderer — Sets up the Three.js WebGLRenderer, scene, and camera.
 *
 * Owns the <canvas> element and handles window resize events.
 * Exposes .scene, .camera, .renderer for other modules to use.
 */

import * as THREE from 'three';
import { beginLoad, loadMark, snapshotDraw, setLoadPhase, clearLoadTag } from './loadLog.js';
import { createBudget, waitIfSlow, yieldToMain } from '../world/yield.js';
import { noteDecision } from './personaLog.js';
import { getActivePreset } from './qualityPresets.js';
import { STREET_WASH_LAYER } from '../world/lightLayers.js';

export class Renderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this._pauseDraw = false;
    this._lastPauseNote = 0;
    this._shadowBakeDeferred = false;
    this._forceShadowBake = false;
    this._shadowBakeAt = 0;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbeafe);
    // Fog disabled (playtest request): keep clear sky color only.
    this.scene.fog = null;

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      4500
    );
    this.camera.position.set(0, 10, 20);
    // See ground tagged for night street-lamp wash (lights on STREET_WASH_LAYER).
    this.camera.layers.enable(STREET_WASH_LAYER);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // Keep the last frame while pauseDraw (compile/stream). Clearing to
      // background every paused GameLoop tick caused blue-screen flicker.
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this._lightProbe = null;

    // Resize handler
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Lights + fog only. compile(mesh, camera, this.scene) traverseVisible of
   * the whole city (Trim_FirstFloor_Window Cube017_3: 3–6s per mesh).
   */
  lightProbe() {
    if (this._lightProbe) return this._lightProbe;
    const probe = new THREE.Scene();
    probe.fog = this.scene.fog;
    for (const child of this.scene.children) {
      if (child.isHemisphereLight || child.isAmbientLight) {
        probe.add(child.clone());
      } else if (child.isDirectionalLight) {
        const light = child.clone();
        light.position.copy(child.position);
        light.target.position.copy(child.target.position);
        probe.add(light);
        probe.add(light.target);
      }
    }
    this._lightProbe = probe;
    return probe;
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    if (this._pauseDraw) {
      // Hold the last presented frame — never clear to sky blue (load flicker).
      snapshotDraw({
        ms: 0,
        tag: 'paused',
        calls: 0,
        tris: 0,
        programs: this.renderer.info.programs?.length ?? 0,
        shadows: this.renderer.shadowMap.enabled,
        baking: false
      });
      return;
    }
    const shadows = this.renderer.shadowMap.enabled;
    // Timed defer: streaming stays true for the whole session, so we cannot
    // gate on loadGovernor.streaming. Hold needsUpdate until _shadowBakeAt so
    // the bake does not stack on the same frame as a burst of new programs.
    if (shadows && this._shadowBakeDeferred) {
      if (performance.now() >= (this._shadowBakeAt || 0) || this._forceShadowBake) {
        this.renderer.shadowMap.needsUpdate = true;
        this._shadowBakeDeferred = false;
      } else {
        this.renderer.shadowMap.needsUpdate = false;
      }
    }
    this._forceShadowBake = false;
    const baking = shadows && this.renderer.shadowMap.needsUpdate;
    const tag = !shadows ? 'frame' : baking ? 'frame+shadow-bake' : 'frame+shadows';
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    const info = this.renderer.info;
    snapshotDraw({
      ms,
      tag,
      calls: info.render.calls,
      tris: info.render.triangles,
      programs: info.programs?.length ?? 0,
      shadows,
      baking
    });
    if (ms >= 33) loadMark('draw', tag, ms);
  }

  /**
   * Turn on shadows after the city is in. Compile every Mesh / InstancedMesh
   * (instancing uses a different program than a shared material on a Mesh).
   */
  async resumeShadows() {
    if (!getActivePreset().shadows) {
      this.renderer.shadowMap.enabled = false;
      return;
    }
    // Keep presenting during shadow program warmup — pauseDraw sandwich here
    // stacked with interactive draw+shadows is a multi-10s Travamentos freeze.
    this._pauseDraw = false;
    setLoadPhase('shadow-warmup');

    beginLoad('gpu', 'shadows-on');
    const tEnable = performance.now();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = false;
    loadMark('gpu', 'shadows-on', performance.now() - tEnable);
    clearLoadTag();

    const objects = [];
    this.scene.traverse((object) => {
      if (object.isMesh) objects.push(object);
    });

    const budget = createBudget();
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      const kind = object.isInstancedMesh ? 'inst' : 'mesh';
      const label = `${kind} ${object.name || i}`;
      clearLoadTag();
      await waitIfSlow();
      beginLoad('gpu', `compile ${label}`);
      const t0 = performance.now();
      await this.renderer.compileAsync(object, this.camera, this.lightProbe());
      object.userData._gpuCompiled = true;
      const mat = object.material;
      if (mat && !Array.isArray(mat)) {
        if (object.isInstancedMesh) mat.userData._gpuInstancedProgramWarmed = true;
        else mat.userData._gpuMeshProgramWarmed = true;
      }
      loadMark('gpu', `compile ${label}`, performance.now() - t0);
      clearLoadTag();
      await budget.tick();
    }

    // Bake ~1.5s later so first shadowed frames are compiles-only, not bake+compile.
    this.renderer.shadowMap.needsUpdate = false;
    this._shadowBakeDeferred = true;
    this._shadowBakeAt = performance.now() + 1500;
    this._forceShadowBake = false;
    clearLoadTag();
    await yieldToMain();
  }

  pauseDraw() {
    const was = this._pauseDraw;
    this._pauseDraw = true;
    if (!was) {
      const now = performance.now();
      if (now - this._lastPauseNote > 500) {
        noteDecision('Renderer', 'pauseDraw');
        this._lastPauseNote = now;
      }
    }
  }

  resumeDraw() {
    const was = this._pauseDraw;
    this._pauseDraw = false;
    if (was) {
      const now = performance.now();
      if (now - this._lastPauseNote > 500) {
        noteDecision('Renderer', 'resumeDraw');
        this._lastPauseNote = now;
      }
    }
  }

  /**
   * autoUpdate=false after resumeShadows — mark the map dirty when new casters
   * stream/reveal so sidewalk trees etc. appear without waiting for a sun move.
   */
  requestShadowBake() {
    if (!this.renderer.shadowMap.enabled) return;
    this._forceShadowBake = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * Compile each Mesh/InstancedMesh under root that is not yet compiled.
   * By default pauses the game-loop draw so new programs cannot land in one
   * render(). Pass pause:false for small apartment rooms so a long
   * setLiveCount batch keeps presenting (curtain open / room through glass).
   * First arg is the mesh (never the whole scene). targetScene is lights+fog
   * only. compileAsync waits until each program is ready. Shared materials
   * already warmed skip re-compile (room template clones).
   * @param {object} root
   * @param {{instancersOnly?: boolean, pause?: boolean}} [opts]
   */
  async compileSubtree(root, { instancersOnly = true, pause = true, only = null } = {}) {
    if (!root) return;
    const wasPaused = this._pauseDraw;
    if (pause) this._pauseDraw = true;
    try {
      const objects = [];
      root.traverse((object) => {
        if (only && !only.has(object)) return;
        if (!object.isMesh || object.userData._gpuCompiled) return;
        if (instancersOnly && !object.userData._streamInstancer) return;
        // Same material already compiled → program is in the driver (clones share mats).
        const mat = object.material;
        if (mat && !Array.isArray(mat)) {
          if (object.isInstancedMesh && mat.userData?._gpuInstancedProgramWarmed) {
            object.userData._gpuCompiled = true;
            return;
          }
          if (!object.isInstancedMesh && mat.userData?._gpuMeshProgramWarmed) {
            object.userData._gpuCompiled = true;
            return;
          }
        }
        objects.push(object);
      });
      for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        const kind = object.isInstancedMesh ? 'inst' : 'mesh';
        const label = `${kind} ${object.name || i}`;
        // Drop sticky tag across yield so rAF gaps are not one multi-10s hitch.
        clearLoadTag();
        await waitIfSlow();
        beginLoad('gpu', `compile ${label}`);
        const t0 = performance.now();
        await this.renderer.compileAsync(object, this.camera, this.lightProbe());
        object.userData._gpuCompiled = true;
        const mat = object.material;
        if (mat && !Array.isArray(mat)) {
          if (object.isInstancedMesh) mat.userData._gpuInstancedProgramWarmed = true;
          else mat.userData._gpuMeshProgramWarmed = true;
        }
        loadMark('gpu', `compile ${label}`, performance.now() - t0);
        clearLoadTag();
        await yieldToMain();
      }
    } finally {
      // Always restore — throw/hang abort must not leave the canvas at 0 draw calls.
      if (pause) this._pauseDraw = wasPaused;
    }
  }
}
