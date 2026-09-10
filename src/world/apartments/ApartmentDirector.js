/**
 * On-demand apartment interiors + curtain overlays for downtown facades.
 * Buildings stay InstancedMesh; live rooms/curtains are InstancedMesh too.
 * 100 distinct layouts via shared furniture×wall InstancedMesh pools
 * (layoutId = stableHash(facadeId, slotIndex) % 100) — no unique Mesh clones,
 * no per-room PointLight. Room/curtain/glass = MeshBasic.
 *
 * Intent:
 * - Shell: every registered facade slot has a closed sheer curtain instance
 *   until a full interior is ready (then curtain snap-hides via scale 0).
 * - Live: stream pump upgrades shells → rooms up to liveTarget / heap cap;
 *   demotion strips back to curtain-only (never blank glass). Same layoutId
 *   on demote/reopen for a given slot.
 */

import * as THREE from 'three';
import {
  getSharedCurtainGeometry,
  getSharedCurtainMaterial
} from './roomTemplate.js';
import { ensureApartmentVariantsBaked } from './aptVariantBake.js';
import { layoutIdFromSlot, getLayout } from './aptLayouts.js';
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
const ALL_CEILING = 2048;
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
const _roomLocal = new THREE.Matrix4();
const _hideMat = new THREE.Matrix4().makeScale(0, 0, 0);
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
    /** @type {THREE.Group|null} */
    this._instancerRoot = null;
    /** @type {THREE.InstancedMesh[][]|null} [furnitureVariant][part] */
    this._furnitureInstancers = null;
    /** @type {THREE.InstancedMesh[][]|null} [wallVariant][part] */
    this._wallInstancers = null;
    /** @deprecated kept null — variants replace single room pool */
    this._roomInstancers = null;
    /** @type {THREE.InstancedMesh|null} */
    this._curtainInstancer = null;
    this._furnitureVariantCount = 0;
    this._wallVariantCount = 0;
    /** @type {Promise<void>|null} serializes first instancer create (many registerFacade). */
    this._instancersReady = null;
    this._instanceCapacity = ALL_CEILING;
    /** @type {number[]} */
    this._freeInstanceIds = [];
    this._nextInstanceId = 0;
    /** Dirty flags so we batch instanceMatrix.needsUpdate once per frame when possible. */
    this._roomMatricesDirty = false;
    this._curtainMatricesDirty = false;
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
    // Closed sheer shells ASAP so reveal never leaves blank glass holes.
    void this._ensureFacadeShells(facadeId).catch(() => {});
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
      if (u.hasRoom) n++;
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
      if (key.startsWith(`${facadeId}#`) && u.hasRoom) n++;
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
   * heap demotion may temporarily shrink (strip farthest rooms → curtain shells).
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
   * open interior (stream-paced); waiting / demoted slots keep closed sheer
   * curtain shells (never blank glass). Heap demotion strips farthest to
   * curtain-only.
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
   * (compile pause:false). Under heap pressure, strip farthest to curtain-only.
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

      // Demote full interiors on other facades to closed sheer shells (keep capacity
      // honest without blank glass on previously live buildings).
      for (const key of [...this.units.keys()]) {
        if (key.startsWith(`${facadeId}#`)) continue;
        const unit = this.units.get(key);
        if (!unit) continue;
        if (unit.hasRoom || unit.state === 'loading' || unit.state === 'ready' || unit.state === 'open') {
          this._stripToCurtainOnly(unit);
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

      // Shell intent first: every slot on this facade gets a closed curtain so
      // waiting / not-yet-live windows never read as white/black holes.
      await this._ensureFacadeShells(facadeId);
      await yieldToMain();
      if (this._intentEpoch !== intentEpoch) return;
      if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;
      noteDecision('Carregador', 'apts curtain shells stamped');

      // Recompute cap each step (MemoryGuardian pressure may rise mid-pump).
      const liveCap = () => {
        this._refreshMaxLoaded(facadeId);
        return this.maxLoaded;
      };

      // Strip excess full rooms when cap shrinks (heap demotion / numeric drop).
      // Leave closed sheer shells — never blank glass.
      const demoteAboveCap = (cap) => {
        const keepIds = new Set(ranked.slice(0, cap).map((s) => s.id));
        for (const slot of facade.slots) {
          if (keepIds.has(slot.id)) continue;
          const key = `${facadeId}#${slot.id}`;
          const unit = this.units.get(key);
          if (!unit) continue;
          if (unit.hasRoom || unit.state === 'loading' || unit.state === 'ready' || unit.state === 'open') {
            this._stripToCurtainOnly(unit);
          }
        }
      };

      let cap = liveCap();
      demoteAboveCap(cap);

      // Full interiors up to stream-owned cap (budgeted). `'all'` → want = ranked.length.
      // Slots beyond cap keep their closed curtain shells from _ensureFacadeShells.
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
            unit = this._spawnCurtainOnly(facade, slot, key);
            this.units.set(key, unit);
          }
          if (unit.hasRoom && unit.state !== 'curtain-only') return;
          await this._ensureBudget();
          if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;
          this._resetCurtainClosed(unit);
          unit.state = 'loading';
          unit.openT = 0;
          if (!this._loadOrder.includes(key)) this._loadOrder.push(key);
          await this._finishLoad(unit);
        });

        if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
        // Hard yield every unit so Travamentos never sees multi-second apartment batches.
        await yieldToMain();
      }

      if (this._intentEpoch !== intentEpoch) return;
      if ((this._facadeEpoch.get(facadeId) || 0) !== facadeEpoch) return;

      // Final trim: heap demotion or numeric target — strip to curtain shells.
      cap = liveCap();
      demoteAboveCap(cap);

      if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
    } finally {
      popApartmentLiveIntent();
      this._pumpRunning = false;
      noteDecision('Carregador', 'apts intent release stream');
    }
  }

  /**
   * Ensure global room/curtain InstancedMeshes exist (capacity = ALL_CEILING).
   * Bake template once; one InstancedMesh per room material + one curtain mesh.
   */
  async _ensureInstancers() {
    if (this._furnitureInstancers) return;
    if (this._instancersReady) {
      await this._instancersReady;
      return;
    }
    this._instancersReady = (async () => {
      const baked = await ensureApartmentVariantsBaked();
      if (this._furnitureInstancers) return;
      const cap = this._instanceCapacity;
      const root = new THREE.Group();
      root.name = 'apartment-instancers';
      root.frustumCulled = false;
      this.parent.add(root);
      this._instancerRoot = root;

      const pinDowntownBound = (mesh) => {
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), 280);
        mesh.computeBoundingSphere = () => {};
      };

      const makeIMs = (specs, namePrefix) => {
        return specs.map((spec, i) => {
          const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, cap);
          mesh.name = `${namePrefix}-${i}`;
          mesh.count = 0;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = true;
          pinDowntownBound(mesh);
          mesh.renderOrder = 30;
          for (let j = 0; j < cap; j++) mesh.setMatrixAt(j, _hideMat);
          mesh.instanceMatrix.needsUpdate = true;
          root.add(mesh);
          return mesh;
        });
      };

      this._furnitureVariantCount = baked.furnitureVariants.length;
      this._wallVariantCount = baked.wallVariants.length;
      this._furnitureInstancers = baked.furnitureVariants.map((fv, v) =>
        makeIMs(fv.roomSpecs, `apartment-furn-${v}`)
      );
      this._wallInstancers = baked.wallVariants.map((wv, v) =>
        makeIMs(wv.roomSpecs, `apartment-wall-${v}`)
      );
      // Legacy alias: first furniture variant parts (warm / debug)
      this._roomInstancers = this._furnitureInstancers[0] || [];

      const curtain = new THREE.InstancedMesh(
        getSharedCurtainGeometry(),
        getSharedCurtainMaterial(),
        cap
      );
      curtain.name = 'apartment-curtain-im';
      curtain.count = 0;
      curtain.castShadow = false;
      curtain.receiveShadow = false;
      curtain.frustumCulled = true;
      pinDowntownBound(curtain);
      curtain.renderOrder = 40;
      for (let j = 0; j < cap; j++) curtain.setMatrixAt(j, _hideMat);
      curtain.instanceMatrix.needsUpdate = true;
      root.add(curtain);
      this._curtainInstancer = curtain;
    })();
    try {
      await this._instancersReady;
    } finally {
      this._instancersReady = null;
    }
  }

  _allocInstanceId() {
    if (this._freeInstanceIds.length) return this._freeInstanceIds.pop();
    if (this._nextInstanceId >= this._instanceCapacity) {
      console.warn('[apartments] instance capacity exhausted', this._instanceCapacity);
      return this._freeInstanceIds.length ? this._freeInstanceIds.pop() : 0;
    }
    const id = this._nextInstanceId++;
    const count = id + 1;
    for (const parts of this._furnitureInstancers || []) {
      for (const mesh of parts) mesh.count = count;
    }
    for (const parts of this._wallInstancers || []) {
      for (const mesh of parts) mesh.count = count;
    }
    if (this._curtainInstancer) this._curtainInstancer.count = count;
    return id;
  }

  _releaseInstanceId(id) {
    if (id == null || id < 0) return;
    this._writeRoomHidden(id);
    this._writeCurtainHidden(id);
    this._freeInstanceIds.push(id);
  }

  /**
   * Stamp furniture + wall pools for one instance id.
   * Only the unit's furnitureVariant / wallVariant receive `matrix`; others hide.
   */
  _writeRoomMatrix(id, matrix, furnitureVariant = 0, wallVariant = 0) {
    const fv = furnitureVariant | 0;
    const wv = wallVariant | 0;
    const furn = this._furnitureInstancers || [];
    for (let v = 0; v < furn.length; v++) {
      const m = v === fv ? matrix : _hideMat;
      for (const mesh of furn[v]) mesh.setMatrixAt(id, m);
    }
    const walls = this._wallInstancers || [];
    for (let v = 0; v < walls.length; v++) {
      const m = v === wv ? matrix : _hideMat;
      for (const mesh of walls[v]) mesh.setMatrixAt(id, m);
    }
    this._roomMatricesDirty = true;
  }

  _writeRoomHidden(id) {
    for (const parts of this._furnitureInstancers || []) {
      for (const mesh of parts) mesh.setMatrixAt(id, _hideMat);
    }
    for (const parts of this._wallInstancers || []) {
      for (const mesh of parts) mesh.setMatrixAt(id, _hideMat);
    }
    this._roomMatricesDirty = true;
  }

  _writeCurtainMatrix(id, matrix) {
    if (!this._curtainInstancer) return;
    this._curtainInstancer.setMatrixAt(id, matrix);
    this._curtainMatricesDirty = true;
  }

  _writeCurtainHidden(id) {
    this._writeCurtainMatrix(id, _hideMat);
  }

  _flushInstanceMatrices() {
    if (this._roomMatricesDirty) {
      for (const parts of this._furnitureInstancers || []) {
        for (const mesh of parts) mesh.instanceMatrix.needsUpdate = true;
      }
      for (const parts of this._wallInstancers || []) {
        for (const mesh of parts) mesh.instanceMatrix.needsUpdate = true;
      }
      this._roomMatricesDirty = false;
    }
    if (this._curtainMatricesDirty && this._curtainInstancer) {
      this._curtainInstancer.instanceMatrix.needsUpdate = true;
      this._curtainMatricesDirty = false;
    }
  }

  /** Slot group world matrix (building × slot local). */
  _slotWorldMatrix(facade, slot, out = _worldMat) {
    const bMat = buildingMatrix(facade.pose);
    const sMat = slotLocalMatrix(slot);
    return out.multiplyMatrices(bMat, sMat);
  }

  /** Room instance matrix = slotWorld × local TRS (near-glass offset + window scale). */
  _composeRoomMatrix(slotWorld, slot, out = _worldMat) {
    const h = slot.height;
    const sx = Math.max(0.65, slot.width / 2.8);
    const sy = Math.max(0.65, slot.height / 2.35);
    const sz = Math.max(sx, sy);
    _dummy.position.set(0, -h * 0.42, 0.04);
    _dummy.quaternion.identity();
    _dummy.scale.set(sx, sy, sz);
    _dummy.updateMatrix();
    return out.multiplyMatrices(slotWorld, _dummy.matrix);
  }

  /**
   * Curtain instance matrix outside glass (−Z). openScaleY in (0,1] shrinks open.
   */
  _composeCurtainMatrix(slotWorld, slot, openScaleY = 1, out = _worldMat) {
    const w = Math.max(slot.width, 0.5) * 1.12;
    const h = Math.max(slot.height, 0.5) * 1.12;
    const baseH = Math.max(slot.height, 0.5);
    _dummy.position.set(0, baseH * 0.5, CURTAIN_OUT_Z);
    _dummy.quaternion.identity();
    _dummy.scale.set(w, Math.max(0.02, h * openScaleY), 1);
    _dummy.updateMatrix();
    return out.multiplyMatrices(slotWorld, _dummy.matrix);
  }

  /**
   * One-shot GPU warm for shared curtain + room InstancedMesh programs (pause:false).
   * Subsequent unit stamps skip warmed programs (Renderer mat flags).
   * Allocates a temp instance id so we never clobber a live curtain shell on id 0.
   */
  async _warmApartmentPrograms() {
    if (this._gpuWarmed || !this.renderer?.compileSubtree) {
      await this._ensureInstancers();
      return;
    }
    await this._ensureInstancers();
    let warmId = -1;
    if (this._roomInstancers?.length) {
      warmId = this._allocInstanceId();
      _dummy.position.set(0, -5000, 0);
      _dummy.scale.set(0.001, 0.001, 0.001);
      _dummy.quaternion.identity();
      _dummy.updateMatrix();
      this._writeRoomMatrix(warmId, _dummy.matrix);
      this._writeCurtainMatrix(warmId, _dummy.matrix);
      this._flushInstanceMatrices();
    }
    try {
      await throughValve(() =>
        this.renderer.compileSubtree(this._instancerRoot, { instancersOnly: false, pause: false })
      );
      this._gpuWarmed = true;
    } catch (_) {
      /* compile optional */
    } finally {
      if (warmId >= 0) this._releaseInstanceId(warmId);
      this._flushInstanceMatrices();
    }
  }

  /**
   * Load specific slot ids on a facade (upgrades curtain-only shells).
   * @returns {Promise<string[]>} unit keys that started loading
   */
  async load(facadeId, slotIds) {
    const facade = this.facades.get(facadeId);
    if (!facade) return [];
    await this._ensureFacadeShells(facadeId);
    const epoch = this._facadeEpoch.get(facadeId) || 0;
    const ids = (Array.isArray(slotIds) ? slotIds : [slotIds])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const started = [];
    for (const slotId of ids) {
      if ((this._facadeEpoch.get(facadeId) || 0) !== epoch) break;
      const key = `${facadeId}#${slotId}`;
      const slot = facade.slots.find((s) => s.id === slotId);
      if (!slot) continue;
      let unit = this.units.get(key);
      if (unit?.hasRoom && unit.state !== 'curtain-only') continue;
      await this._ensureBudget();
      if ((this._facadeEpoch.get(facadeId) || 0) !== epoch) break;
      if (!unit) {
        unit = this._spawnCurtainOnly(facade, slot, key);
        this.units.set(key, unit);
      }
      this._resetCurtainClosed(unit);
      unit.state = 'loading';
      unit.openT = 0;
      if (!this._loadOrder.includes(key)) this._loadOrder.push(key);
      started.push(key);
      await throughValve(() => this._finishLoad(unit));
      if (this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
      await yieldToMain();
    }
    return started;
  }

  /**
   * Pick up to `n` best slots without a full interior (curtain-only / missing).
   */
  pickBestSlotIds(facadeId, n = 1) {
    const facade = this.facades.get(facadeId);
    if (!facade) return [];
    const want = Math.max(0, Math.floor(n));
    const idle = facade.slots.filter((s) => {
      const u = this.units.get(`${facadeId}#${s.id}`);
      return !u || !u.hasRoom || u.state === 'curtain-only';
    });
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
    // Strip rooms → closed sheer shells (never blank glass holes).
    for (const key of keys) {
      const unit = this.units.get(key);
      if (!unit) continue;
      if (unit.hasRoom || unit.state === 'loading' || unit.state === 'ready' || unit.state === 'open') {
        this._stripToCurtainOnly(unit);
      }
    }
    if (facadeId && this._houseFacadeId === facadeId) this._syncHouseHud(true, facadeId);
  }

  update(dt) {
    const step = Math.max(0, dt);
    let curtainDirty = false;
    for (const unit of this.units.values()) {
      if (unit.state !== 'open' && unit.state !== 'ready') continue;
      if (unit.state === 'ready') unit.state = 'open';
      if (unit.openT >= 1) {
        if (unit.curtainVisible) {
          this._writeCurtainHidden(unit.instanceId);
          unit.curtainVisible = false;
          curtainDirty = true;
        }
        continue;
      }
      unit.openT = Math.min(1, unit.openT + step / OPEN_DURATION);
      const t = unit.openT * unit.openT * (3 - 2 * unit.openT);
      const sy = Math.max(0.02, 1 - t);
      const facade = this.facades.get(unit.facadeId);
      if (!facade) continue;
      this._composeCurtainMatrix(unit.slotWorld, unit.slot, sy, _roomLocal);
      this._writeCurtainMatrix(unit.instanceId, _roomLocal);
      curtainDirty = true;
      if (unit.openT >= 1) {
        this._writeCurtainHidden(unit.instanceId);
        unit.curtainVisible = false;
      }
    }
    if (curtainDirty || this._roomMatricesDirty || this._curtainMatricesDirty) {
      this._flushInstanceMatrices();
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

  /** Sync Interiores budget chrome only — no floating debug badge. */
  _syncHouseHud(on, facadeId = '') {
    const input = document.getElementById('apts-budget-input');
    const panel = document.getElementById('apts-budget');
    if (!on) return;
    const live = this.facadeLoadedCount(facadeId);
    const total = this.facades.get(facadeId)?.slots?.length ?? live;
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
      const unit = this.units.get(oldest);
      // Curtain-only shells do not count toward the live budget — skip eviction.
      if (!unit.hasRoom) continue;
      this._stripToCurtainOnly(unit);
    }
  }

  /**
   * Stamp closed sheer curtains for every slot on a facade that lacks a unit.
   * Shared InstancedMesh only — no per-slot materials.
   */
  async _ensureFacadeShells(facadeId) {
    const facade = this.facades.get(facadeId);
    if (!facade?.slots?.length) return;
    await this._ensureInstancers();
    let added = 0;
    for (const slot of facade.slots) {
      const key = `${facadeId}#${slot.id}`;
      if (this.units.has(key)) continue;
      this.units.set(key, this._spawnCurtainOnly(facade, slot, key));
      added += 1;
    }
    if (added) this._flushInstanceMatrices();
  }

  /**
   * Curtain-only shell (closed sheer). Room hidden; visible until upgraded to ready.
   */
  _spawnCurtainOnly(facade, slot, key) {
    const slotWorld = this._slotWorldMatrix(facade, slot, new THREE.Matrix4());
    const instanceId = this._allocInstanceId();
    // Stable layout for this facade slot — demote/reopen keeps the same id.
    const layoutId = layoutIdFromSlot(facade.id, slot.id);
    const layout = getLayout(layoutId);

    this._composeCurtainMatrix(slotWorld, slot, 1, _roomLocal);
    this._writeCurtainMatrix(instanceId, _roomLocal);
    this._writeRoomHidden(instanceId);
    this._flushInstanceMatrices();

    return {
      key,
      facadeId: facade.id,
      slotId: slot.id,
      slot,
      instanceId,
      slotWorld,
      layoutId,
      furnitureVariant: layout.furnitureVariant,
      wallVariant: layout.wallVariant,
      hasRoom: false,
      room: null,
      curtain: null,
      reveal: null,
      curtainVisible: true,
      state: 'curtain-only',
      openT: 0,
      host: facade.parent || this.parent
    };
  }

  /** @deprecated Prefer _spawnCurtainOnly then upgrade via _finishLoad. */
  _spawnUnit(facade, slot, key) {
    const unit = this._spawnCurtainOnly(facade, slot, key);
    unit.state = 'loading';
    return unit;
  }

  async _finishLoad(unit) {
    if (unit.state !== 'loading') return;

    await this._ensureInstancers();

    // Ensure layoutId (stable across demote/reopen).
    if (unit.layoutId == null) {
      unit.layoutId = layoutIdFromSlot(unit.facadeId, unit.slotId);
      const layout = getLayout(unit.layoutId);
      unit.furnitureVariant = layout.furnitureVariant;
      unit.wallVariant = layout.wallVariant;
    }

    // Transparent glass + instanced 3D room (furniture×wall pools, no PointLight).
    this._composeRoomMatrix(unit.slotWorld, unit.slot, _roomLocal);
    this._writeRoomMatrix(
      unit.instanceId,
      _roomLocal,
      unit.furnitureVariant ?? 0,
      unit.wallVariant ?? 0
    );
    unit.hasRoom = true;
    unit.room = true; // legacy truthy for any external checks
    unit.reveal = null;

    // pause:false — do not freeze the canvas for the whole apartment batch.
    // Programs warmed once on InstancedMesh root; per-unit compile is a no-op after.
    if (this.renderer?.compileSubtree && !this._gpuWarmed) {
      try {
        await this.renderer.compileSubtree(this._instancerRoot, {
          instancersOnly: false,
          pause: false
        });
        this._gpuWarmed = true;
      } catch (_) {
        /* compile optional */
      }
    }

    unit.state = 'ready';
    // Snap-hide curtain so a closed plane never sits over the lit room.
    unit.openT = 1;
    this._writeCurtainHidden(unit.instanceId);
    unit.curtainVisible = false;
    this._flushInstanceMatrices();
    // One painted frame per room even when compile is a no-op (warmed mats).
    await new Promise((r) => requestAnimationFrame(r));
  }

  _resetCurtainClosed(unit) {
    if (!unit || unit.instanceId == null) return;
    this._composeCurtainMatrix(unit.slotWorld, unit.slot, 1, _roomLocal);
    this._writeCurtainMatrix(unit.instanceId, _roomLocal);
    unit.curtainVisible = true;
    unit.openT = 0;
    this._flushInstanceMatrices();
  }

  /**
   * Drop the room instance (shared geos/mats kept) and leave a closed curtain.
   */
  _stripToCurtainOnly(unit) {
    if (!unit) return;
    this._writeRoomHidden(unit.instanceId);
    unit.hasRoom = false;
    unit.room = null;
    unit.reveal = null;
    this._resetCurtainClosed(unit);
    unit.state = 'curtain-only';
    this._loadOrder = this._loadOrder.filter((k) => k !== unit.key);
  }

  _disposeUnit(key) {
    const unit = this.units.get(key);
    if (!unit) return;
    this._releaseInstanceId(unit.instanceId);
    this._flushInstanceMatrices();
    this.units.delete(key);
    this._loadOrder = this._loadOrder.filter((k) => k !== key);
  }

  /** Debug: stable layout id + recipe for a facade slot. */
  layoutIdFor(facadeId, slotIndex) {
    const id = layoutIdFromSlot(facadeId, slotIndex);
    return { layoutId: id, layout: getLayout(id) };
  }
}
