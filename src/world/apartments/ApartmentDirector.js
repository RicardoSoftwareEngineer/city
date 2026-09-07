/**
 * On-demand apartment interiors + curtain overlays for downtown facades.
 * Buildings stay InstancedMesh; rooms/curtains are separate scene objects.
 */

import * as THREE from 'three';
import { createApartmentRoom, createCurtain } from './roomTemplate.js';
import { throughValve, yieldToMain } from '../yield.js';
import { memoryGuardian } from '../../engine/memoryGuardian.js';
import {
  pushApartmentLiveIntent,
  popApartmentLiveIntent,
  isApartmentLiveIntentActive
} from '../../engine/streamIntent.js';
import { noteDecision } from '../../engine/personaLog.js';

/** Spec 05 — numeric fallback / heap demotion floor (HUD can change liveTarget). */
export const MAX_LOADED = 3;
/** Absolute fallback when facade length unknown. */
const ALL_CEILING = 256;
/** Heap pressure → demote live full-interior cap (MemoryGuardian-friendly). */
const HEAP_DEMOTE = 0.72;
const HEAP_SOFT_DEMOTE = 0.6;

const OPEN_DURATION = 0.2;
const MID_Y_MIN = 3;
const MID_Y_MAX = 20;
/** Curtain sits outside glass along local −Z (toward street). */
const CURTAIN_OUT_Z = -0.14;
/** Reveal plane flush with window from outside (still −Z of glass). */

const _dummy = new THREE.Object3D();
const _slotMat = new THREE.Matrix4();
const _buildingMat = new THREE.Matrix4();
const _worldMat = new THREE.Matrix4();
const _inward = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _look = new THREE.Matrix4();

function facadeKey(typeName, x, z) {
  return `${typeName}@${x.toFixed(2)},${z.toFixed(2)}`;
}

/** World Y for the house icon — always above downtown roofs. */
const HOUSE_MARKER_Y = 160;

/**
 * Screen-space house + tall neon pole. sizeAttenuation:false keeps constant
 * on-screen size from high free-fly (world-scaled sprites vanish at altitude).
 */
function createHouseMarker(roofY) {
  const group = new THREE.Group();
  group.name = 'apartment-house-marker';

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(8, 47, 73, 0.95)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();

  const cx = size / 2;
  const cy = size / 2 + 18;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.rect(cx - 90, cy - 10, 180, 130);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(cx - 120, cy - 10);
  ctx.lineTo(cx, cy - 130);
  ctx.lineTo(cx + 120, cy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 28, cy + 40, 56, 80);
  ctx.strokeRect(cx - 28, cy + 40, 56, 80);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(cx - 78, cy + 20, 40, 40);
  ctx.fillRect(cx + 38, cy + 20, 40, 40);
  ctx.strokeRect(cx - 78, cy + 20, 40, 40);
  ctx.strokeRect(cx + 38, cy + 20, 40, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  // World-space giant billboard (80 m) — screen-space sprites were easy to lose.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      sizeAttenuation: true
    })
  );
  sprite.scale.set(80, 80, 1);
  sprite.position.y = HOUSE_MARKER_Y;
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  group.add(sprite);

  // Extra solid beacon cube — impossible to miss even if texture fails
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false })
  );
  beacon.position.y = HOUSE_MARKER_Y;
  beacon.renderOrder = 997;
  beacon.frustumCulled = false;
  group.add(beacon);

  // Pole from roof up to the icon so the eye can trace which building
  const top = HOUSE_MARKER_Y;
  const bottom = Math.max(2, roofY);
  const len = Math.max(8, top - bottom);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, len, 8),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, depthTest: false, depthWrite: false })
  );
  pole.position.y = bottom + len * 0.5;
  pole.renderOrder = 998;
  pole.frustumCulled = false;
  group.add(pole);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false, depthWrite: false })
  );
  tip.position.y = top;
  tip.renderOrder = 998;
  tip.frustumCulled = false;
  group.add(tip);

  return group;
}

function buildingMatrix(pose) {
  _dummy.position.set(pose.x, pose.y ?? 0, pose.z);
  _dummy.rotation.set(0, pose.rot ?? 0, 0);
  _dummy.scale.set(1, 1, 1);
  _dummy.updateMatrix();
  return _buildingMat.copy(_dummy.matrix);
}

/**
 * Slot local matrix: origin at window center, −Z toward street (outward normal),
 * room depth into +Z (inward).
 */
function slotLocalMatrix(slot) {
  const outward = new THREE.Vector3(slot.nx, slot.ny, slot.nz).normalize();
  if (outward.lengthSq() < 1e-8) outward.set(0, 0, -1);
  // Basis: +Z = inward = −outward; −Z = outward (toward street / glass).
  _inward.copy(outward).multiplyScalar(-1);
  _right.crossVectors(_up, _inward);
  if (_right.lengthSq() < 1e-8) {
    _right.set(1, 0, 0);
  } else {
    _right.normalize();
  }
  const trueUp = new THREE.Vector3().crossVectors(_inward, _right).normalize();
  // Columns: right, up, inward (+Z)
  _look.makeBasis(_right, trueUp, _inward);
  _slotMat.identity();
  _slotMat.setPosition(slot.x, slot.y, slot.z);
  _slotMat.multiply(_look);
  return _slotMat;
}

/** Prefer mid-height street-facing windows; largest area first. */
function scoreSlot(slot) {
  const area = (slot.width || 1) * (slot.height || 1);
  const y = slot.y ?? 0;
  const mid = y >= MID_Y_MIN && y <= MID_Y_MAX ? 1 : 0;
  // Horizontal outward normal strength (street-facing vs roof/ground).
  const outwardH = Math.hypot(slot.nx || 0, slot.nz || 0);
  // Distance from mid-band center (~11.5) as soft penalty when outside band.
  const midCenter = (MID_Y_MIN + MID_Y_MAX) * 0.5;
  const yBonus = mid ? 1000 + (20 - Math.abs(y - midCenter)) : Math.max(0, 50 - Math.abs(y - midCenter));
  return yBonus + area * 10 + outwardH * 5;
}

export class ApartmentDirector {
  /**
   * @param {object} opts
   * @param {THREE.Object3D} opts.parent scene/group for overlays
   * @param {{compileSubtree?: Function}|null} [opts.renderer]
   * @param {number} [opts.maxLoaded] numeric soft baseline until first intent (heap demote floor)
   */
  constructor({ parent, renderer = null, maxLoaded = MAX_LOADED } = {}) {
    this.parent = parent;
    this.renderer = renderer;
    /** @type {number|'all'} HUD-driven live interior target. Default `'all'` = every slot full room. */
    this.liveTarget = 'all';
    this.maxLoaded = typeof maxLoaded === 'number' ? maxLoaded : ALL_CEILING;
    /** @type {Map<string, {id:string,slots:any[],pose:any,parent:THREE.Object3D}>} */
    this.facades = new Map();
    /** @type {Map<string, object>} key = facadeId#slotId */
    this.units = new Map();
    this._loadOrder = [];
    /** @type {THREE.Object3D|null} */
    this._houseMarker = null;
    this._houseFacadeId = null;
    /** Prevent overlapping auto-load from markFacadeHouse. */
    this._autoLoadPending = new Set();
    /** Bumped on unload so in-flight loads abort cleanly. */
    this._facadeEpoch = new Map();
    /** Serialize intent applies / stream pumps. */
    this._liveApplyChain = Promise.resolve();
    /** Active stream intent — HUD sets target; pump owns pacing. */
    this._intentFacadeId = null;
    this._intentEpoch = 0;
    this._pumpRunning = false;
    /** Shared curtain/room GPU programs warmed once. */
    this._gpuWarmed = false;
  }

  static facadeId(typeName, x, z) {
    return facadeKey(typeName, x, z);
  }

  registerFacade(facadeId, { slots, pose, parent, height = 18, centerZ = 4 } = {}) {
    if (!facadeId || !slots?.length) return;
    this.facades.set(facadeId, {
      id: facadeId,
      slots: slots.slice(),
      pose: { x: pose.x, y: pose.y ?? 0, z: pose.z, rot: pose.rot ?? 0 },
      parent: parent || this.parent,
      height,
      centerZ
    });
    // Auto-mark first Large so the house appears without waiting for the Interiores HUD.
    if (!this._houseFacadeId && /Large/i.test(facadeId)) {
      this.markFacadeHouse(facadeId);
    }
  }

  listFacades() {
    return [...this.facades.keys()];
  }

  getFacade(facadeId) {
    return this.facades.get(facadeId) || null;
  }

  getLiveTarget() {
    return this.liveTarget;
  }

  /** True while a stream-paced live-intent pump is in flight (Todos / setLiveCount). */
  isLiveIntentActive() {
    return this._pumpRunning || isApartmentLiveIntentActive();
  }

  /** Full interiors only (room present) — not curtain-only shells. */
  loadedCount() {
    let n = 0;
    for (const u of this.units.values()) {
      if (u.room) n++;
    }
    return n;
  }

  curtainOnlyCount() {
    let n = 0;
    for (const u of this.units.values()) {
      if (u.state === 'curtain-only') n++;
    }
    return n;
  }

  facadeLoadedCount(facadeId) {
    if (!facadeId) return 0;
    let n = 0;
    for (const [key, u] of this.units) {
      if (key.startsWith(`${facadeId}#`) && u.room) n++;
    }
    return n;
  }

  facadeUnitCount(facadeId) {
    if (!facadeId) return 0;
    let n = 0;
    for (const key of this.units.keys()) {
      if (key.startsWith(`${facadeId}#`)) n++;
    }
    return n;
  }

  _refreshMaxLoaded(facadeId = null) {
    this.maxLoaded = this._effectiveLiveCap(facadeId);
  }

  /**
   * Stream-owned full-interior cap for the active intent.
   * `'all'` / Todos → every window slot (ranked.length), then MemoryGuardian
   * heap demotion may temporarily shrink (unload farthest — not curtain shells).
   */
  _effectiveLiveCap(facadeId = null) {
    const f = facadeId ? this.facades.get(facadeId) : null;
    const slots = f?.slots?.length || ALL_CEILING;
    let want;
    if (this.liveTarget === 'all') {
      want = slots;
    } else {
      want = Math.min(Math.max(0, this.liveTarget | 0), slots);
    }
    const p = memoryGuardian.pressure ?? 0.5;
    if (p >= HEAP_DEMOTE) want = Math.min(want, MAX_LOADED);
    else if (p >= HEAP_SOFT_DEMOTE) {
      want = Math.min(want, Math.max(MAX_LOADED, Math.floor(want * 0.5)));
    }
    return Math.max(0, want);
  }

  /**
   * Set live-interior **intent** for a facade. Does not slam every slot on the
   * click — a stream pump applies with LoadGovernor frame budget + yields
   * (same persona as streets/nature). `'all'` / Todos = every slot a full
   * open interior (stream-paced); heap demotion unloads farthest if needed.
   * @param {string} facadeId
   * @param {number|'all'} count
   */
  async setLiveCount(facadeId, count) {
    const run = async () => {
      const facade = this.facades.get(facadeId);
      if (!facade) return;

      if (count === 'all') {
        this.liveTarget = 'all';
      } else {
        const n = Math.max(0, Math.floor(Number(count)));
        this.liveTarget = Number.isFinite(n) ? n : 0;
      }
      this._intentFacadeId = facadeId;
      this._intentEpoch += 1;
      const intentEpoch = this._intentEpoch;
      this._refreshMaxLoaded(facadeId);

      // Abort in-flight loads for this facade; pump starts clean.
      this._facadeEpoch.set(facadeId, (this._facadeEpoch.get(facadeId) || 0) + 1);
      const facadeEpoch = this._facadeEpoch.get(facadeId);

      await this._pumpLiveIntent(facadeId, intentEpoch, facadeEpoch);
    };

    const next = this._liveApplyChain.then(run, run);
    this._liveApplyChain = next.catch(() => {});
    return next;
  }

  /**
   * Apply current liveTarget on facadeId with hard ms/frame budget between units.
   * Progressive: rooms appear as each unit finishes; canvas stays drawing
   * (compile pause:false). Under heap pressure, unload farthest (full dispose).
   */
  async _pumpLiveIntent(facadeId, intentEpoch, facadeEpoch) {
    const facade = this.facades.get(facadeId);
    if (!facade) return;

    // Own the stream persona: WorldStream defers nature/carpet/water (prio ≥4)
    // pauseDraw compiles so Travamentos does not flag multi-second BUG LOAD
    // while Todos pumps. Not an FPS HOLD — cooperative ownership only.
    this._pumpRunning = true;
    pushApartmentLiveIntent();
    noteDecision('Carregador', 'apts intent owns stream');
    try {
      const ranked = facade.slots.slice().sort((a, b) => scoreSlot(b) - scoreSlot(a));

      // Free full interiors on other facades so global budget stays honest.
      for (const key of [...this.units.keys()]) {
        if (key.startsWith(`${facadeId}#`)) continue;
        const unit = this.units.get(key);
        if (!unit) continue;
        if (unit.room || unit.state === 'loading' || unit.state === 'ready' || unit.state === 'open') {
          this._disposeUnit(key);
        }
      }
      await yieldToMain();
      if (this._intentEpoch !== intentEpoch) return;
      if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;

      // Warm shared curtain + room programs once (pause:false) so the pump
      // never pays a multi-mesh first-compile hitch on the click frame.
      await this._warmApartmentPrograms();
      await yieldToMain();
      if (this._intentEpoch !== intentEpoch) return;
      if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;

      // Recompute cap each step (MemoryGuardian pressure may rise mid-pump).
      const liveCap = () => {
        this._refreshMaxLoaded(facadeId);
        return this.maxLoaded;
      };

      // Unload excess full rooms when cap shrinks (heap demotion / numeric drop).
      // Prefer dispose farthest / lowest-ranked — closed curtain-only is not “Todos”.
      const unloadAboveCap = (cap) => {
        const keepIds = new Set(ranked.slice(0, cap).map((s) => s.id));
        for (const slot of facade.slots) {
          if (keepIds.has(slot.id)) continue;
          const key = `${facadeId}#${slot.id}`;
          if (this.units.has(key)) this._disposeUnit(key);
        }
      };

      let cap = liveCap();
      unloadAboveCap(cap);

      // Full interiors up to stream-owned cap (budgeted). `'all'` → want = ranked.length.
      for (let i = 0; i < ranked.length; i++) {
        if (this._intentEpoch !== intentEpoch) return;
        if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;
        cap = liveCap();
        if (i >= cap) break;

        const slot = ranked[i];
        const key = `${facadeId}#${slot.id}`;
        let unit = this.units.get(key);

        await throughValve(async () => {
          if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;
          if (!unit) {
            await this._ensureBudget();
            if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;
            unit = this._spawnUnit(facade, slot, key);
            this.units.set(key, unit);
            this._loadOrder.push(key);
            await this._finishLoad(unit);
          } else if (!unit.room || unit.state === 'curtain-only') {
            this._resetCurtainClosed(unit);
            unit.state = 'loading';
            unit.openT = 0;
            await this._finishLoad(unit);
          }
        });

        if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
        // Hard yield every unit so Travamentos never sees multi-second apartment batches.
        await yieldToMain();
      }

      if (this._intentEpoch !== intentEpoch) return;
      if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;

      // Final trim: heap demotion or numeric target — unload, never Phase-B curtain shells.
      cap = liveCap();
      unloadAboveCap(cap);

      if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
    } finally {
      popApartmentLiveIntent();
      this._pumpRunning = false;
      noteDecision('Carregador', 'apts intent release stream');
    }
  }

  /**
   * One-shot GPU warm for shared curtain + room materials (pause:false).
   * Subsequent unit compiles skip warmed programs (Renderer mat flags).
   */
  async _warmApartmentPrograms() {
    if (this._gpuWarmed || !this.renderer?.compileSubtree) return;
    const group = new THREE.Group();
    group.name = 'apt-warm';
    group.visible = false;
    group.frustumCulled = false;
    group.add(createCurtain(2, 2));
    try {
      const room = await createApartmentRoom();
      group.add(room);
    } catch (_) {
      /* room template optional for curtain-only warm */
    }
    const host = this.parent;
    host.add(group);
    try {
      await throughValve(() =>
        this.renderer.compileSubtree(group, { instancersOnly: false, pause: false })
      );
      this._gpuWarmed = true;
    } catch (_) {
      /* compile optional */
    } finally {
      host.remove(group);
    }
  }

  /**
   * Load specific slot ids on a facade.
   * @returns {Promise<string[]>} unit keys that started loading
   */
  async load(facadeId, slotIds) {
    const facade = this.facades.get(facadeId);
    if (!facade) return [];
    const epoch = this._facadeEpoch.get(facadeId) || 0;
    const ids = (Array.isArray(slotIds) ? slotIds : [slotIds])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const started = [];
    for (const slotId of ids) {
      if ((this._facadeEpoch.get(facadeId) || 0) !== epoch) break;
      const key = `${facadeId}#${slotId}`;
      if (this.units.has(key)) continue;
      const slot = facade.slots.find((s) => s.id === slotId);
      if (!slot) continue;
      await this._ensureBudget();
      if ((this._facadeEpoch.get(facadeId) || 0) !== epoch) break;
      const unit = this._spawnUnit(facade, slot, key);
      this.units.set(key, unit);
      this._loadOrder.push(key);
      started.push(key);
      await throughValve(() => this._finishLoad(unit));
      if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
      await yieldToMain();
    }
    return started;
  }

  /**
   * Pick up to `n` best idle slots: mid-height (y≈3–20), largest, street-facing.
   */
  pickBestSlotIds(facadeId, n = 1) {
    const facade = this.facades.get(facadeId);
    if (!facade) return [];
    const want = Math.max(0, Math.floor(n));
    const idle = facade.slots.filter((s) => !this.units.has(`${facadeId}#${s.id}`));
    idle.sort((a, b) => scoreSlot(b) - scoreSlot(a));
    return idle.slice(0, want).map((s) => s.id);
  }

  /**
   * Load `n` more idle slots on the facade (best mid-height street-facing first).
   */
  async loadCount(facadeId, n = 1) {
    const ids = this.pickBestSlotIds(facadeId, n);
    return this.load(facadeId, ids);
  }

  unload(facadeId = null, slotIds = null) {
    const keys = [...this.units.keys()].filter((key) => {
      if (facadeId && !key.startsWith(`${facadeId}#`)) return false;
      if (slotIds == null) return true;
      const sid = Number(key.split('#')[1]);
      return slotIds.includes(sid);
    });
    // Full-facade (or global) unload aborts in-flight loads for that facade.
    if (slotIds == null) {
      if (facadeId) {
        this._facadeEpoch.set(facadeId, (this._facadeEpoch.get(facadeId) || 0) + 1);
        this._autoLoadPending.delete(facadeId);
      } else {
        for (const id of this.facades.keys()) {
          this._facadeEpoch.set(id, (this._facadeEpoch.get(id) || 0) + 1);
        }
        this._autoLoadPending.clear();
      }
    }
    for (const key of keys) this._disposeUnit(key);
    if (facadeId && this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
  }

  update(dt) {
    const step = Math.max(0, dt);
    for (const unit of this.units.values()) {
      if (unit.state !== 'open' && unit.state !== 'ready') continue;
      if (unit.state === 'ready') unit.state = 'open';
      if (unit.openT >= 1) {
        unit.curtain.visible = false;
        continue;
      }
      unit.openT = Math.min(1, unit.openT + step / OPEN_DURATION);
      const t = unit.openT * unit.openT * (3 - 2 * unit.openT);
      // Shared curtain mat — open via scale/visibility only (never opacity).
      const bx = unit.curtain.userData.baseScaleX ?? 1;
      const by = unit.curtain.userData.baseScaleY ?? 1;
      const sy = Math.max(0.02, 1 - t);
      unit.curtain.scale.set(bx, by * sy, 1);
      if (unit.openT >= 1) {
        unit.curtain.visible = false;
      }
    }
  }

  /**
   * Place / move the 🏠 billboard above a facade (clears previous).
   * @param {string} facadeId
   * @param {{autoLoad?: boolean}} [opts] autoLoad (default true): if the facade
   *   has 0 full interiors, apply liveTarget. HUD budget apply passes false so
   *   it does not race setLiveCount('all') and later strip back to 3.
   */
  markFacadeHouse(facadeId, { autoLoad = true } = {}) {
    const facade = this.facades.get(facadeId);
    if (!facade) return;
    const host = facade.parent || this.parent;
    if (this._houseMarker?.parent) this._houseMarker.parent.remove(this._houseMarker);
    const cos = Math.cos(facade.pose.rot);
    const sin = Math.sin(facade.pose.rot);
    const cz = facade.centerZ ?? 4;
    const roofY = facade.height ?? 18;
    this._houseMarker = createHouseMarker(roofY);
    // Group origin on the ground footprint center; pole+sprite use local Y.
    this._houseMarker.position.set(
      facade.pose.x + sin * cz,
      0,
      facade.pose.z + cos * cz
    );
    host.add(this._houseMarker);
    this._houseFacadeId = facadeId;
    this._syncHouseHud(true, facadeId);

    // First mark (e.g. Large auto-mark) applies the current liveTarget budget.
    if (
      autoLoad &&
      this.facadeLoadedCount(facadeId) === 0 &&
      !this._autoLoadPending.has(facadeId)
    ) {
      this._autoLoadPending.add(facadeId);
      const epoch = this._facadeEpoch.get(facadeId) || 0;
      void (async () => {
        try {
          await Promise.resolve(); // let a sync HUD setLiveCount win
          if ((this._facadeEpoch.get(facadeId) || 0) !== epoch) return;
          if (this.facadeLoadedCount(facadeId) > 0) return;
          if (this._houseFacadeId !== facadeId) return;
          await this.setLiveCount(facadeId, this.liveTarget);
          if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
        } finally {
          this._autoLoadPending.delete(facadeId);
        }
      })();
    }
  }

  clearHouseMarker() {
    if (this._houseMarker?.parent) this._houseMarker.parent.remove(this._houseMarker);
    this._houseFacadeId = null;
    this._syncHouseHud(false);
  }

  _syncHouseHud(on, facadeId = '') {
    const el = document.getElementById('apts-house-hud');
    const input = document.getElementById('apts-budget-input');
    const panel = document.getElementById('apts-budget');
    if (!on) {
      if (el) {
        el.hidden = true;
        el.textContent = '';
      }
      return;
    }
    const live = this.facadeLoadedCount(facadeId);
    const total = this.facades.get(facadeId)?.slots?.length ?? live;
    if (el) {
      el.hidden = false;
      el.textContent = `CASA APTS · ${live}/${total} vivos — ${facadeId}`;
    }
    // Keep Interiores HUD honest while setLiveCount runs (Todos used to stay at 3).
    if (input) {
      input.value =
        this.liveTarget === 'all' ? String(live) : String(this.liveTarget);
    }
    if (panel) {
      const label = this.liveTarget === 'all' ? 'Todos' : String(this.liveTarget);
      panel.title = `Interiores ${label} · ${live}/${total} — ${facadeId}`;
    }
    const allBtn = document.getElementById('apts-budget-all');
    if (allBtn) allBtn.setAttribute('aria-pressed', this.liveTarget === 'all' ? 'true' : 'false');
  }

  /** Nearest registered facade to (x,z), or first Large*, or first overall. */
  pickFacadeNear(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const f of this.facades.values()) {
      const dx = f.pose.x - x;
      const dz = f.pose.z - z;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d < bestD) {
        bestD = d;
        best = f.id;
      }
    }
    if (best) return best;
    for (const id of this.facades.keys()) {
      if (/Large/i.test(id)) return id;
    }
    return this.facades.keys().next().value || null;
  }

  async _ensureBudget() {
    while (this.loadedCount() >= this.maxLoaded && this._loadOrder.length) {
      const oldest = this._loadOrder.shift();
      if (!oldest || !this.units.has(oldest)) continue;
      // Curtain-only shells do not count toward the live budget — skip eviction.
      if (!this.units.get(oldest).room) continue;
      this._disposeUnit(oldest);
    }
  }

  _spawnUnit(facade, slot, key) {
    const group = new THREE.Group();
    group.name = `apt:${key}`;
    group.frustumCulled = false;

    const curtain = createCurtain(slot.width, slot.height);
    curtain.userData.baseScaleX = curtain.scale.x;
    curtain.userData.baseScaleY = curtain.scale.y;
    // OUTSIDE the glass along local −Z (toward street) so it reads on the facade.
    curtain.position.z = CURTAIN_OUT_Z;
    curtain.renderOrder = 40;
    group.add(curtain);

    const bMat = buildingMatrix(facade.pose);
    const sMat = slotLocalMatrix(slot);
    _worldMat.multiplyMatrices(bMat, sMat);
    _worldMat.decompose(group.position, group.quaternion, group.scale);

    const host = facade.parent || this.parent;
    host.add(group);

    return {
      key,
      facadeId: facade.id,
      slotId: slot.id,
      slot,
      group,
      curtain,
      reveal: null,
      room: null,
      state: 'loading',
      openT: 0,
      host
    };
  }

  async _finishLoad(unit) {
    if (unit.state !== 'loading') return;

    // Phase 1: no opaque reveal plane — transparent glass + real 3D room behind.
    const room = await createApartmentRoom();
    const h = unit.slot.height;
    // Closer to glass (−Z opening) so near-window props read from the street.
    room.position.set(0, -h * 0.42, 0.04);
    const sx = Math.max(0.65, unit.slot.width / 2.8);
    const sy = Math.max(0.65, unit.slot.height / 2.35);
    room.scale.set(sx, sy, Math.max(sx, sy));
    room.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 30;
        obj.frustumCulled = false;
      }
    });
    unit.group.add(room);
    unit.room = room;
    unit.reveal = null;

    // pause:false — do not freeze the canvas for the whole apartment batch;
    // game loop keeps drawing so curtains open and rooms show through glass.
    if (this.renderer?.compileSubtree) {
      try {
        await this.renderer.compileSubtree(unit.group, {
          instancersOnly: false,
          pause: false
        });
      } catch (_) {
        /* compile optional */
      }
    }

    unit.state = 'ready';
    // Snap-hide curtain so a closed plane never sits over the lit room.
    unit.openT = 1;
    unit.curtain.visible = false;
    // One painted frame per room even when compile is a no-op (warmed mats).
    await new Promise((r) => requestAnimationFrame(r));
  }

  _resetCurtainClosed(unit) {
    if (!unit?.curtain) return;
    unit.curtain.visible = true;
    const bx = unit.curtain.userData.baseScaleX ?? 1;
    const by = unit.curtain.userData.baseScaleY ?? 1;
    unit.curtain.scale.set(bx, by, 1);
    // Shared material — do not poke opacity.
    unit.openT = 0;
  }

  /**
   * Drop the room mesh (shared template geos/mats kept) and leave a closed curtain.
   */
  _stripToCurtainOnly(unit) {
    if (!unit) return;
    if (unit.room) {
      unit.group.remove(unit.room);
      // Clones share template geometry/materials — do not dispose them.
      unit.room = null;
    }
    if (unit.reveal) {
      unit.group.remove(unit.reveal);
      unit.reveal.geometry?.dispose?.();
      if (unit.reveal.material?.map) unit.reveal.material.map.dispose?.();
      unit.reveal.material?.dispose?.();
      unit.reveal = null;
    }
    this._resetCurtainClosed(unit);
    unit.state = 'curtain-only';
  }

  _disposeUnit(key) {
    const unit = this.units.get(key);
    if (!unit) return;
    unit.host?.remove(unit.group);
    unit.group.traverse((obj) => {
      // Curtain geo/mat are shared across units — never dispose them.
      if (obj.name === 'apartment-reveal') {
        obj.geometry?.dispose?.();
        if (obj.material?.map) obj.material.map.dispose?.();
        obj.material?.dispose?.();
      }
      // Shared room geometries stay cached on the template.
    });
    this.units.delete(key);
    this._loadOrder = this._loadOrder.filter((k) => k !== key);
  }
}
