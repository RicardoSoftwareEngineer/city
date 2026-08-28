/**
 * Renderer — Sets up the Three.js WebGLRenderer, scene, and camera.
 *
 * Owns the <canvas> element and handles window resize events.
 * Exposes .scene, .camera, .renderer for other modules to use.
 */

import * as THREE from 'three';
import { beginLoad, loadMark, snapshotDraw, setLoadPhase } from './loadLog.js';
import { createBudget, waitIfSlow, yieldToMain } from '../world/yield.js';

export class Renderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this._pauseDraw = false;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbeafe);
    this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.004);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 10, 20);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
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
      this.renderer.setClearColor(this.scene.background, 1);
      this.renderer.clear();
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
    this._pauseDraw = true;
    setLoadPhase('shadow-warmup');

    beginLoad('gpu', 'shadows-on');
    const tEnable = performance.now();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = false;
    loadMark('gpu', 'shadows-on', performance.now() - tEnable);

    const objects = [];
    this.scene.traverse((object) => {
      if (object.isMesh) objects.push(object);
    });

    const budget = createBudget();
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      const kind = object.isInstancedMesh ? 'inst' : 'mesh';
      const label = `${kind} ${object.name || i}`;
      beginLoad('gpu', `compile ${label}`);
      const t0 = performance.now();
      this.renderer.compile(object, this.camera, this.lightProbe());
      loadMark('gpu', `compile ${label}`, performance.now() - t0);
      await budget.tick();
      await waitIfSlow();
    }

    this.renderer.shadowMap.needsUpdate = true;
    this._pauseDraw = false;
    await yieldToMain();
  }

  pauseDraw() {
    this._pauseDraw = true;
  }

  resumeDraw() {
    this._pauseDraw = false;
  }

  /**
   * Compile each Mesh/InstancedMesh under root that is not yet compiled.
   * Pause the game-loop draw so 8 new programs cannot land in one render().
   * First arg is the mesh (never the whole scene). targetScene is lights+fog only
   * so lights match the real draw — compile(mesh, camera) without lights
   * left first render() to compile 9–13 programs. compile() only starts
   * the driver compile; compileAsync waits until each program is ready so
   * 13 shaders cannot stall one later render() (stream ring 10 prio 0 +13prog).
   * Only InstancedMesh from makeBatchMesh (`_streamInstancer`). Compiling the
   * whole city group also recompiled the Porsche (~13 programs) on ring 10.
   */
  async compileSubtree(root) {
    if (!root) return;
    const wasPaused = this._pauseDraw;
    this._pauseDraw = true;
    const objects = [];
    root.traverse((object) => {
      if (
        object.isMesh &&
        object.userData._streamInstancer &&
        !object.userData._gpuCompiled
      ) {
        objects.push(object);
      }
    });
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      const kind = object.isInstancedMesh ? 'inst' : 'mesh';
      const label = `${kind} ${object.name || i}`;
      beginLoad('gpu', `compile ${label}`);
      const t0 = performance.now();
      await this.renderer.compileAsync(object, this.camera, this.lightProbe());
      object.userData._gpuCompiled = true;
      loadMark('gpu', `compile ${label}`, performance.now() - t0);
      await yieldToMain();
    }
    this._pauseDraw = wasPaused;
  }
}
