/**
 * Streams the city in Chebyshev rings of 10 m around the car.
 * Terrain meshes run on a continuous background loop (never gated by street pumps).
 * Then streets → props → bank → buildings → countryside veg (prio ≤4).
 * Dense carpet (prio 5) is background-only — never blocks radius expansion
 * or Foco pronto (optional HUD line only).
 */

import { loadGltf } from './AssetLoader.js';
import {
  chebyshev,
  createGrowingInstancedGltf,
  minPoseDist
} from './instancing.js';
import { createBudget, throughValve, waitUntilSmooth, yieldAfterWork, yieldToMain, pushDeferValveHold, popDeferValveHold } from './yield.js';
import { memoryGuardian } from '../engine/memoryGuardian.js';
import { loadGovernor } from '../engine/LoadGovernor.js';
import { beginLoad, clearLoadTag, dumpLoadLog, setStreamLabel } from '../engine/loadLog.js';
import { phaseIdForPriority, ensureLoadPhase, endLoadPhase } from '../engine/loadOrderLog.js';
import {
  effectiveLoadRadius,
  publishFocusRemain,
  armFocusRemain,
  setNearTerrainReady
} from '../engine/focusRemain.js';
import { beginRing, endRing, measureRingItem, measureRingItemSync, recordRingItem } from '../engine/ringLoadLog.js';
import { castOpts } from './shadowPolicy.js';
import { noteDecision } from '../engine/personaLog.js';
import { noteZonePolicy } from '../engine/qualityAdapter.js';
import {
  isApartmentLiveIntentActive,
  APARTMENT_DEFER_PRIORITY
} from '../engine/streamIntent.js';

export const STREAM_STEP = 10;
/** Max priority that may gate ring expansion (streets…base veg). */
export const STREAM_PRIORITY_CORE = 4;
/** Dense grass carpet — background slices only. */
export const STREAM_PRIORITY_CARPET = 5;
/** Carpet pump / phase completion disk (m). Never chase full residency R. */
export const CARPET_REVEAL_RADIUS = 80;

const PRIO_LABEL = {
  0: 'ruas',
  1: 'mobília',
  2: 'banco',
  3: 'prédios',
  4: 'natureza',
  5: 'carpet'
};

function jobLabel(job) {
  if (job.url) {
    const base = String(job.url).split('/').pop() || job.url;
    return base.replace(/\.glb$/i, '');
  }
  if (job.name) return job.name;
  return PRIO_LABEL[job.priority] || 'job';
}

function posesCentroid(poses) {
  let sx = 0, sz = 0;
  const n = poses.length || 1;
  for (const p of poses) { sx += p.x; sz += p.z; }
  return { x: sx / n, z: sz / n };
}

/** Outer zone: drop castShadow if it was on (subtle low-quality intent). */
function zoneAwareOptions(options, poses) {
  const c = posesCentroid(poses);
  noteZonePolicy(c.x, c.z);
  if (memoryGuardian.isInnerZone(c.x, c.z)) return options || {};
  if (options && options.castShadow === true) {
    noteDecision('QualityAdapter', 'outer zone: skip castShadow');
    return { ...options, castShadow: false };
  }
  return options || {};
}


/** Never reveal until capacity-1 + compileAsync warmup completed for the template. */
async function ensureGrowerWarmed(grower, renderer, label = 'warmup') {
  if (!grower || grower.warmed) return;
  if (typeof grower.warmup !== 'function') return;
  if (renderer) {
    await measureRingItem(label, () => throughValve(() => grower.warmup(renderer)));
  } else {
    await grower.warmup(null);
  }
}

function registerGrowerResident(id, kind, poses, job) {
  if (!job?.grower || typeof job.grower.dispose !== 'function') return;
  const c = posesCentroid(poses);
  // Huge campo pose lists must NOT ride on the resident — Guardian tick would
  // O(n) every frame and nearest-pose residency never evicts (soft-cap starve).
  const keepPoses = Array.isArray(poses) && poses.length > 0 && poses.length <= 48
    ? poses
    : null;
  memoryGuardian.retain(id, {
    kind,
    x: c.x,
    z: c.z,
    poses: keepPoses,
    dispose: () => {
      try { job.grower?.dispose?.(); } catch {}
      job.grower = null;
    }
  });
}

export class WorldStream {
  constructor(parent, ox, oz, renderer = null) {
    this.parent = parent;
    this.ox = ox;
    this.oz = oz;
    this.renderer = renderer;
    this.urlJobs = [];
    this.templateJobs = [];
    this.tasks = [];
    this.buildings = [];
    this._lastPumpNote = 0;
    this._lastWantsNote = 0;
    this._lastAptsDeferNote = 0;
  }

  /** Apartment live-intent owns Valve — defer nature/carpet (prio ≥4). */
  _shouldDeferLowPrioStream(priority = APARTMENT_DEFER_PRIORITY) {
    if (priority < APARTMENT_DEFER_PRIORITY) return false;
    if (!isApartmentLiveIntentActive()) return false;
    const now = performance.now();
    if (now - this._lastAptsDeferNote > 1500) {
      noteDecision('Carregador', `defer prio≥${APARTMENT_DEFER_PRIORITY} (apts intent)`);
      this._lastAptsDeferNote = now;
    }
    return true;
  }

  addUrl(url, poses, options = {}, priority = 0) {
    if (!url || !poses?.length) return;
    // Unique uid — near+far veg share URLs; retain id must not collide/dispose.
    this.urlJobs.push({
      url,
      poses,
      options,
      priority,
      grower: null,
      uid: `u${this.urlJobs.length}`
    });
  }

  addTemplate(template, poses, options = {}, priority = 1) {
    if (!template || !poses?.length) return;
    this.templateJobs.push({ template, poses, options, priority, grower: null });
  }

  addTask(entry) {
    this.tasks.push({
      priority: 2,
      kind: null,
      done: false,
      ...entry
    });
  }

  addBuilding(entry) {
    this.buildings.push({
      ...entry,
      grower: null,
      revealed: 0,
      sorted: entry.placements.slice().sort(
        (a, b) => chebyshev(a.x, a.z, this.ox, this.oz) - chebyshev(b.x, b.z, this.ox, this.oz)
      )
    });
  }

  maxRadius() {
    let max = 0;
    const bump = (x, z) => {
      const d = chebyshev(x, z, this.ox, this.oz);
      if (d > max) max = d;
    };
    for (const job of this.urlJobs) {
      for (const p of job.poses) bump(p.x, p.z);
    }
    for (const job of this.templateJobs) {
      for (const p of job.poses) bump(p.x, p.z);
    }
    for (const task of this.tasks) {
      if (task.dist > max) max = task.dist;
    }
    for (const b of this.buildings) {
      for (const p of b.sorted) bump(p.x, p.z);
    }
    return max;
  }

  /**
   * Count real pending work for a priority inside focus residency radius.
   * Grower existence alone is NOT pending (that caused eternal phase reopen).
   */
  countPriorityPending(priority, radius, focus) {
    const fx = focus.x;
    const fz = focus.z;
    const R = effectiveLoadRadius();
    let urlLoads = 0;
    let tplLoads = 0;
    let tasks = 0;
    let poses = 0;
    let buildings = 0;
    const inFocus = (x, z) => chebyshev(x, z, fx, fz) <= R + 0.01;

    for (const job of this.urlJobs) {
      if (job.priority !== priority) continue;
      if (minPoseDist(job.poses, this.ox, this.oz) > radius) continue;
      if (minPoseDist(job.poses, fx, fz) > R) continue;
      if (!job.grower) {
        if (!job.loading) urlLoads += 1;
        continue;
      }
      poses += job.grower.unrevealedNear?.(fx, fz, R) ?? job.grower.pendingRevealCount?.(radius) ?? 0;
    }
    for (const job of this.templateJobs) {
      if (job.priority !== priority) continue;
      if (minPoseDist(job.poses, this.ox, this.oz) > radius) continue;
      if (minPoseDist(job.poses, fx, fz) > R) continue;
      if (!job.grower) {
        tplLoads += 1;
        continue;
      }
      poses += job.grower.unrevealedNear?.(fx, fz, R) ?? job.grower.pendingRevealCount?.(radius) ?? 0;
    }
    for (const task of this.tasks) {
      if (task.done || task.kind === 'terrain') continue;
      if (task.priority !== priority) continue;
      if (task.dist > radius) continue;
      tasks += 1;
    }
    if (priority === 3) {
      for (const b of this.buildings) {
        if (!b.sorted.length) continue;
        if (chebyshev(b.sorted[0].x, b.sorted[0].z, this.ox, this.oz) > radius) continue;
        if (!inFocus(b.sorted[0].x, b.sorted[0].z)) continue;
        if (!b.grower) {
          buildings += b.sorted.filter((p) => inFocus(p.x, p.z)).length || 1;
          continue;
        }
        buildings += b.grower.unrevealedNear?.(fx, fz, R) ?? b.grower.pendingRevealCount?.(radius) ?? 0;
      }
    }
    return { urlLoads, tplLoads, tasks, poses, buildings, total: urlLoads + tplLoads + tasks + poses + buildings };
  }

  /**
   * Build numbered remaining list for HUD (current focus residency / vista).
   * Core = terrain vista + streets + furniture + bank + buildings + nature prio≤4.
   * Dense carpet (prio 5) is optional background — never blocks Foco pronto.
   */
  computeFocusRemain() {
    const focus = memoryGuardian.focus;
    const radius = effectiveLoadRadius();
    const carpetR = Math.min(CARPET_REVEAL_RADIUS, radius);
    const items = [];
    const optional = [];
    let total = 0;
    let done = 0;

    let terrainPending = 0;
    let terrainDone = 0;
    for (const t of this.tasks) {
      if (t.kind !== 'terrain' || t.x == null) continue;
      if (!memoryGuardian.allowsTerrainAt(t.x, t.z)) continue;
      if (t.done) terrainDone += 1;
      else terrainPending += 1;
    }
    done += terrainDone;
    if (terrainPending) {
      items.push({ label: 'Terreno tiles na vista', count: terrainPending });
      total += terrainPending;
    }

    const urlByLabel = new Map();
    let carpetUrlLoads = 0;
    for (const job of this.urlJobs) {
      if (job.grower) continue;
      if (job.priority === STREAM_PRIORITY_CARPET) {
        if (minPoseDist(job.poses, focus.x, focus.z) <= carpetR) carpetUrlLoads += 1;
        continue;
      }
      if (minPoseDist(job.poses, focus.x, focus.z) > radius) continue;
      const label = `glTF ${jobLabel(job)}`;
      urlByLabel.set(label, (urlByLabel.get(label) || 0) + 1);
    }
    for (const job of this.templateJobs) {
      if (job.grower) continue;
      if (minPoseDist(job.poses, focus.x, focus.z) > radius) continue;
      const label = 'template (postes/etc.)';
      urlByLabel.set(label, (urlByLabel.get(label) || 0) + 1);
    }
    for (const [label, count] of urlByLabel) {
      items.push({ label, count });
      total += count;
    }
    if (carpetUrlLoads) {
      optional.push({ label: 'glTF carpet (fundo)', count: carpetUrlLoads });
    }

    const poseByPrio = new Map();
    const bumpPose = (priority, n) => {
      if (n <= 0) return;
      const label = `poses ${PRIO_LABEL[priority] || `p${priority}`}`;
      poseByPrio.set(label, (poseByPrio.get(label) || 0) + n);
    };
    let carpetPoses = 0;
    for (const job of this.urlJobs) {
      if (!job.grower) continue;
      if (job.priority === STREAM_PRIORITY_CARPET) {
        carpetPoses += job.grower.unrevealedNear?.(focus.x, focus.z, carpetR) || 0;
        continue;
      }
      const n = job.grower.unrevealedNear?.(focus.x, focus.z, radius) || 0;
      bumpPose(job.priority, n);
    }
    for (const job of this.templateJobs) {
      if (!job.grower) continue;
      const n = job.grower.unrevealedNear?.(focus.x, focus.z, radius) || 0;
      bumpPose(job.priority, n);
    }
    for (const [label, count] of poseByPrio) {
      items.push({ label, count });
      total += count;
    }
    if (carpetPoses) {
      optional.push({ label: 'poses carpet', count: carpetPoses });
    }

    let bld = 0;
    for (const b of this.buildings) {
      if (!b.sorted.length) continue;
      const inFocus = b.sorted.filter(
        (p) => chebyshev(p.x, p.z, focus.x, focus.z) <= radius + 0.01
      );
      if (!inFocus.length) continue;
      if (!b.grower) bld += inFocus.length;
      else bld += b.grower.unrevealedNear?.(focus.x, focus.z, radius) || 0;
    }
    if (bld) {
      items.push({ label: 'Prédios restantes', count: bld });
      total += bld;
    }

    let taskPend = 0;
    for (const t of this.tasks) {
      if (t.done || t.kind === 'terrain') continue;
      if (t.dist > radius) continue;
      taskPend += 1;
    }
    if (taskPend) {
      items.push({ label: 'Tasks (banco/etc.)', count: taskPend });
      total += taskPend;
    }

    // Rough done counter: revealed core poses + finished terrain in scope.
    for (const job of this.urlJobs) {
      if (job.priority === STREAM_PRIORITY_CARPET) continue;
      if (job.grower?.revealed) done += job.grower.revealed;
    }
    for (const job of this.templateJobs) {
      if (job.grower?.revealed) done += job.grower.revealed;
    }
    for (const b of this.buildings) {
      if (b.grower?.revealed) done += b.grower.revealed;
    }

    return { total, done, items, optional };
  }

  publishRemain() {
    setNearTerrainReady(this.hasNearTerrainProgress());
    return publishFocusRemain(this.computeFocusRemain());
  }

  async pumpTo(radius, maxPriority = 5) {

    const now = performance.now();
    const loadR = effectiveLoadRadius();
    // Soft-cap full: still drain in-radius remaining so Fila do foco can reach 0.
    let forceFocusDrain = false;
    if (!memoryGuardian.wantsLoad && this.computeFocusRemain().total > 0) {
      forceFocusDrain = true;
    }
    if (!memoryGuardian.wantsLoad && !forceFocusDrain) {
      if (now - this._lastWantsNote > 2000) {
        noteDecision('Carregador', 'wantsLoad false');
        this._lastWantsNote = now;
      }
      // Soft-cap / valve hold must still close phases whose in-radius work is 0.
      this.endIdleCorePhases(Math.min(radius, loadR), maxPriority);
      this.publishRemain();
      return;
    }
    if (now - this._lastPumpNote > 2000) {
      noteDecision(
        'Carregador',
        forceFocusDrain
          ? `focus drain r${Math.round(loadR)}`
          : `pump r${Math.round(Math.min(radius, loadR))}`
      );
      this._lastPumpNote = now;
    }
    const capped = Math.min(radius, loadR);
    radius = capped;
    const priorities = [0, 1, 2, 3, 4, 5].filter((p) => p <= maxPriority);
    const budget = createBudget();
    const focus = memoryGuardian.focus;
    beginRing(radius);

    for (const priority of priorities) {
      if (this._shouldDeferLowPrioStream(priority)) continue;
      setStreamLabel(`stream r${radius} p${priority}`);
      beginLoad('stream', `ring ${radius} prio ${priority}`);
      const toLoad = this.urlJobs.filter(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          !job.loading &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius &&
          minPoseDist(job.poses, focus.x, focus.z) <= loadR
      );
      const pendingTpl = this.templateJobs.some(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius &&
          minPoseDist(job.poses, focus.x, focus.z) <= loadR
      );
      const pendingTasks = this.tasks.some(
        (task) =>
          !task.done &&
          task.kind !== 'terrain' &&
          task.priority === priority &&
          task.dist <= radius
      );
      const pending = this.countPriorityPending(priority, radius, focus);
      const phaseId = phaseIdForPriority(priority);
      if (phaseId && pending.total > 0) {
        ensureLoadPhase(phaseId, `r${radius}`);
      }

      for (const job of toLoad) {
        if (job.grower || job.loading) continue;
        job.loading = true;
        try {
          const template = await measureRingItem(job.url, () =>
            throughValve(() => loadGltf(job.url, zoneAwareOptions(job.options, job.poses)))
          );
          if (template && typeof job.options.prepare === 'function') {
            await throughValve(async () => { job.options.prepare(template); });
          }
          const tGrow = performance.now();
          job.grower = template
            ? createGrowingInstancedGltf(
              this.parent,
              template,
              job.poses,
              this.ox,
              this.oz,
              zoneAwareOptions(job.options, job.poses)
            )
            : { reveal() { return 0; }, get warmed() { return true; }, async warmup() {} };
          if (template) recordRingItem(`instancer ${job.url}`, performance.now() - tGrow);
          if (template && this.renderer && job.grower.warmup) {
            await measureRingItem(`warmup ${job.url.split('/').pop() || 'url'}`, () =>
              throughValve(() => job.grower.warmup(this.renderer))
            );
          }
          registerGrowerResident(`url:${job.uid || job.url}`, 'world', job.poses, job);
        } finally {
          job.loading = false;
        }
        await yieldAfterWork();
      }

      for (const job of this.templateJobs) {
        if (job.priority !== priority || job.grower) continue;
        if (minPoseDist(job.poses, this.ox, this.oz) > radius) continue;
        if (minPoseDist(job.poses, focus.x, focus.z) > loadR) continue;
        await throughValve(async () => {
          measureRingItemSync('template instancer', () => {
            job.grower = createGrowingInstancedGltf(
              this.parent,
              job.template,
              job.poses,
              this.ox,
              this.oz,
              zoneAwareOptions(job.options, job.poses)
            );
          });
        });
        if (this.renderer && job.grower.warmup) {
          await measureRingItem('warmup template', () =>
            throughValve(() => job.grower.warmup(this.renderer))
          );
        }
        {
          const c = posesCentroid(job.poses);
          registerGrowerResident(
            `tpl:p${priority}:${Math.round(c.x)}:${Math.round(c.z)}`,
            'world',
            job.poses,
            job
          );
        }
        await yieldAfterWork();
      }

      if (this.renderer) this.renderer.pauseDraw();
      for (const job of this.urlJobs) {
        if (!job.grower || job.priority !== priority) continue;
        await ensureGrowerWarmed(job.grower, this.renderer, `warmup ${job.url?.split('/').pop() || 'url'}`);
        let added = 0;
        while (job.grower.reveal(radius, loadGovernor.chunk) > 0) {
          added += 1;
          await budget.tick();
        }
        if (added && this.renderer) {
          await measureRingItem(`compile urls r${radius} p${priority}`, () =>
            throughValve(() => this.renderer.compileSubtree(this.parent))
          );
          this.renderer.resumeDraw();
          await yieldToMain();
          this.renderer.pauseDraw();
        }
      }
      for (const job of this.templateJobs) {
        if (!job.grower || job.priority !== priority) continue;
        await ensureGrowerWarmed(job.grower, this.renderer, 'warmup template');
        let added = 0;
        while (job.grower.reveal(radius, loadGovernor.chunk) > 0) {
          added += 1;
          await budget.tick();
        }
        if (added && this.renderer) {
          await measureRingItem(`compile templates r${radius} p${priority}`, () =>
            throughValve(() => this.renderer.compileSubtree(this.parent))
          );
          this.renderer.resumeDraw();
          await yieldToMain();
          this.renderer.pauseDraw();
        }
      }
      if (this.renderer) this.renderer.resumeDraw();

      const tasks = this.tasks.filter(
        (task) =>
          !task.done &&
          task.kind !== 'terrain' &&
          task.priority === priority &&
          task.dist <= radius
      );
      for (const task of tasks) {
        await measureRingItem(`task p${priority} d${Math.round(task.dist)}`, () =>
          throughValve(() => task.run())
        );
        task.done = true;
        await yieldAfterWork();
      }

      await this.revealBuildings(radius, priority, budget);

      // End phase when this priority has nothing left in-radius (do not keep
      // running forever just because growers still exist).
      if (phaseId) {
        const left = this.countPriorityPending(priority, radius, focus);
        if (left.total === 0) endLoadPhase(phaseId);
      }
    }
    endRing(radius);
    this.publishRemain();
  }

  async revealBuildings(radius, priority, budget) {
    if (priority !== 3) return;

    for (const b of this.buildings) {
      if (!b.sorted.length) continue;
      if (chebyshev(b.sorted[0].x, b.sorted[0].z, this.ox, this.oz) > radius) continue;
      if (!memoryGuardian.allowsAt(b.sorted[0].x, b.sorted[0].z)) continue;

      if (!b.grower) {
        if (b.heavy) await waitUntilSmooth();
        const template = await measureRingItem(b.url || b.name || 'building', () =>
          throughValve(() => b.load())
        );
        await yieldAfterWork();
        if (!template) continue;
        if (b.heavy) await waitUntilSmooth();
        b.template = template;
        await throughValve(async () => {
          measureRingItemSync(`instancer ${b.url || b.name || 'building'}`, () => {
            b.grower = createGrowingInstancedGltf(
              this.parent,
              template,
              b.sorted,
              this.ox,
              this.oz,
              {
                ...castOpts(),
                onReveal: (p) => b.onReveal?.(p, template)
              }
            );
          });
        });
        if (!b.grower) continue;
        if (this.renderer && b.grower.warmup) {
          await measureRingItem(`warmup ${b.name || b.url || 'building'}`, () =>
            throughValve(() => b.grower.warmup(this.renderer))
          );
        }
        registerGrowerResident(`bld:${b.name || b.url || 'building'}`, 'building', b.sorted, b);
        await yieldToMain();
      }

      // Guardian may have disposed the grower (soft-cap / evict) between load and reveal.
      if (!b.grower) continue;

      // Same as urlJobs: pause so makeBatchMesh cannot compile-via-draw
      // (instancer Small_2 x4 +3prog ~3s). Compile new instancers, then one draw.
      await ensureGrowerWarmed(b.grower, this.renderer, `warmup ${b.name || b.url || 'building'}`);
      if (this.renderer) this.renderer.pauseDraw();
      let added = 0;
      if (!b.primed) {
        if (b.grower.reveal(radius, 1) > 0) {
          b.primed = true;
          added += 1;
        }
      }
      while (b.grower && b.grower.reveal(radius, loadGovernor.chunk) > 0) {
        added += 1;
        await budget.tick();
      }
      if (added && this.renderer) {
        await measureRingItem(`compile building r${radius}`, () =>
          throughValve(() => this.renderer.compileSubtree(this.parent))
        );
        this.renderer.resumeDraw();
        await yieldToMain();
        this.renderer.pauseDraw();
      } else if (added) {
        if (b.heavy) await waitUntilSmooth();
        await yieldToMain();
      }
      if (this.renderer) this.renderer.resumeDraw();
    }
  }

  /**
   * End async core phases that have nothing left inside the current radius.
   * Safe while wantsLoad is false — avoids streets/furniture/… timers running for hours.
   */
  endIdleCorePhases(radius, maxPriority = STREAM_PRIORITY_CORE) {
    const focus = memoryGuardian.focus;
    const priorities = [0, 1, 2, 3, 4].filter((p) => p <= maxPriority);
    for (const priority of priorities) {
      const phaseId = phaseIdForPriority(priority);
      if (!phaseId) continue;
      const left = this.countPriorityPending(priority, radius, focus);
      if (left.total === 0) endLoadPhase(phaseId);
    }
  }

  /**
   * Build terrain tiles inside the fence-scale vista ring (heap-gated).
   * Uses allowsTerrainAt — not adaptive residency R — so far campo can fill
   * while Guardian is stuck ~180 m for streets.
   * Returns how many tiles were successfully built this call.
   */
  async pumpTerrainSlice(maxTiles = 12) {
    const focus = memoryGuardian.focus;
    const pending = this.tasks
      .filter(
        (task) =>
          task.kind === 'terrain' &&
          !task.done &&
          !task.building &&
          task.x != null &&
          memoryGuardian.allowsTerrainAt(task.x, task.z)
      )
      .sort(
        (a, b) =>
          chebyshev(a.x, a.z, focus.x, focus.z) - chebyshev(b.x, b.z, focus.x, focus.z)
      );

    if (!pending.length || !memoryGuardian.wantsTerrainLoad) return 0;

    const COMPILE_EVERY = 8;
    let sinceCompile = 0;
    let built = 0;

    const flushCompile = async (label) => {
      if (!sinceCompile || !this.renderer) return;
      // Do not leave prior terrain/street loadMark sticky across pauseDraw/compile.
      clearLoadTag();
      this.renderer.pauseDraw();
      await measureRingItem(label, () =>
        throughValve(() => this.renderer.compileSubtree(this.parent))
      );
      this.renderer.resumeDraw();
      clearLoadTag();
      await yieldToMain();
      sinceCompile = 0;
    };

    setStreamLabel(`terrain vista${Math.round(memoryGuardian.vistaRadius)}`);
    ensureLoadPhase('terrain', `vista${Math.round(memoryGuardian.vistaRadius)}`);

    // Defer Valve HOLD for the whole terrain pump slice (not only first near
    // tiles). Concurrent street throughValve pauseDraw must not freeze the view
    // across tile commits / yieldToMain while this slice is building.
    pushDeferValveHold();
    try {
      for (const task of pending) {
        if (built >= maxTiles || !memoryGuardian.wantsTerrainLoad) break;
        if (!memoryGuardian.allowsTerrainAt(task.x, task.z)) continue;

        const dFocus = chebyshev(task.x, task.z, focus.x, focus.z);
        beginRing(Math.round(dFocus / STREAM_STEP) * STREAM_STEP || STREAM_STEP);
        const ok = await measureRingItem(
          `terrain mesh d${Math.round(dFocus)}`,
          () => task.run()
        );
        endRing();
        if (ok) {
          task.done = true;
          built += 1;
          sinceCompile += 1;
        }
        await yieldAfterWork();
        if (sinceCompile >= COMPILE_EVERY) {
          await flushCompile(`compile terrain slice`);
        }
      }

      await flushCompile('compile terrain slice final');
    } finally {
      popDeferValveHold();
    }
    return built;
  }

  /** Fill allowed terrain until heap pressure or nothing left in-circle. */
  async pumpTerrainTo(step = STREAM_STEP) {
    for (let i = 0; i < 64; i++) {
      const n = await this.pumpTerrainSlice(12);
      if (n === 0) break;
      if (!memoryGuardian.wantsTerrainLoad) break;
      await yieldToMain();
    }
  }

  /** True once at least one in-vista terrain tile has been built (carpet may start). */
  hasNearTerrainProgress() {
    return this.tasks.some(
      (t) => t.kind === 'terrain' && t.done && t.x != null && memoryGuardian.allowsTerrainAt(t.x, t.z)
    );
  }

  /**
   * Continuous terrain mesh pump. Concurrent with street pumpTo — Valve serializes
   * GPU commits, but green tiles no longer wait for a whole asphalt ring.
   */
  startTerrainBackground() {
    if (this._terrainBg) return;
    this._terrainBg = true;
    const loop = async () => {
      for (;;) {
        const pendingInVista = this.tasks.some(
          (t) =>
            t.kind === 'terrain' &&
            !t.done &&
            t.x != null &&
            memoryGuardian.allowsTerrainAt(t.x, t.z)
        );
        if (pendingInVista) {
          ensureLoadPhase('terrain', `bg vista${Math.round(memoryGuardian.vistaRadius)}`);
          await this.pumpTerrainSlice(16);
        } else {
          endLoadPhase('terrain');
          this.publishRemain();
          await yieldToMain();
        }
      }
    };
    void loop().catch((err) => console.error('terrain background failed:', err));
  }

  /**
   * Continuous base-vegetation slices (prio 4). Soft-cap must not block —
   * uses wantsNatureLoad (heap-only), same lesson as terrain #94.
   */
  startNatureBackground() {
    if (this._natureBg) return;
    this._natureBg = true;
    const loop = async () => {
      for (;;) {
        await this.pumpNatureSlice({ maxLoads: 1, maxRevealPasses: 2 });
        await yieldToMain();
      }
    };
    void loop().catch((err) => console.error('nature background failed:', err));
  }

  /**
   * One background slice of base veg (prio 4). Independent of street soft-cap.
   */
  async pumpNatureSlice({ maxLoads = 1, maxRevealPasses = 2 } = {}) {
    const priority = STREAM_PRIORITY_CORE;
    const radius = effectiveLoadRadius();
    const focus = memoryGuardian.focus;

    const pendingLoad = this.urlJobs.filter(
      (job) =>
        job.priority === priority &&
        !job.grower &&
        !job.loading &&
        minPoseDist(job.poses, this.ox, this.oz) <= radius &&
        minPoseDist(job.poses, focus.x, focus.z) <= radius
    );
    const pendingReveal = this.urlJobs.reduce((n, job) => {
      if (job.priority !== priority || !job.grower) return n;
      return n + (job.grower.unrevealedNear?.(focus.x, focus.z, radius) || 0);
    }, 0);
    if (!pendingLoad.length && pendingReveal === 0) {
      endLoadPhase('nature');
      this.publishRemain();
      return 0;
    }
    // Apartment Todos / live-intent owns the stream — do not pauseDraw-compile nature.
    if (this._shouldDeferLowPrioStream(priority)) return 0;
    // Heap gate after empty-check so a full table cannot leave nature "running" forever.
    if (!memoryGuardian.wantsNatureLoad) return 0;

    ensureLoadPhase('nature', `bg r${Math.round(radius)}`);
    setStreamLabel(`nature bg r${Math.round(radius)}`);
    let work = 0;
    const budget = createBudget();

    for (const job of pendingLoad.slice(0, maxLoads)) {
      if (job.grower || job.loading) continue;
      job.loading = true;
      try {
        const template = await measureRingItem(job.url, () =>
          throughValve(() => loadGltf(job.url, zoneAwareOptions(job.options, job.poses)))
        );
        if (template && typeof job.options.prepare === 'function') {
          await throughValve(async () => { job.options.prepare(template); });
        }
        job.grower = template
          ? createGrowingInstancedGltf(
            this.parent,
            template,
            job.poses,
            this.ox,
            this.oz,
            zoneAwareOptions(job.options, job.poses)
          )
          : { reveal() { return 0; }, get warmed() { return true; }, async warmup() {} };
        if (template && this.renderer && job.grower.warmup) {
          await measureRingItem('warmup nature', () =>
            throughValve(() => job.grower.warmup(this.renderer))
          );
        }
        registerGrowerResident(`url:${job.uid || job.url}`, 'world', job.poses, job);
        work += 1;
      } finally {
        job.loading = false;
      }
      await yieldAfterWork();
    }

    // Re-check: intent may have started between loads and reveal.
    if (this._shouldDeferLowPrioStream(priority)) return work;
    if (this.renderer) this.renderer.pauseDraw();
    let passes = 0;
    for (const job of this.urlJobs) {
      if (passes >= maxRevealPasses) break;
      if (!job.grower || job.priority !== priority) continue;
      await ensureGrowerWarmed(job.grower, this.renderer, 'warmup nature');
      let added = 0;
      const maxAdd = Math.min(loadGovernor.chunk, 8);
      if (job.grower.reveal(radius, maxAdd) > 0) {
        added += 1;
        await budget.tick();
      }
      if (added) {
        passes += 1;
        work += added;
        if (this.renderer) {
          await measureRingItem('compile nature', () =>
            throughValve(() => this.renderer.compileSubtree(this.parent))
          );
          this.renderer.resumeDraw();
          await yieldToMain();
          this.renderer.pauseDraw();
        } else {
          await yieldToMain();
        }
      }
    }
    if (this.renderer) this.renderer.resumeDraw();
    return work;
  }

  /** Continuous dense-carpet slices (prio 5), independent of ring expansion. */
  startCarpetBackground() {
    if (this._carpetBg) return;
    this._carpetBg = true;
    const loop = async () => {
      // Do not fight the main thread with Grass instancers while near terrain builds.
      while (!this.hasNearTerrainProgress()) {
        await yieldToMain();
      }
      for (;;) {
        await this.pumpCarpetSlice({ maxLoads: 1, maxRevealPasses: 3 });
        await yieldToMain();
      }
    };
    void loop().catch((err) => console.error('carpet background failed:', err));
  }

  /**
   * One background slice of dense carpet (prio 5). Never expands rings and never
   * runs inside pumpTo(core) — light/core work must not wait on this.
   * Returns work units done (loads + reveal passes).
   */
  async pumpCarpetSlice({ maxLoads = 1, maxRevealPasses = 2 } = {}) {
    const priority = STREAM_PRIORITY_CARPET;
    // Small near-city disk only — never keep carpet phase running for full residency R.
    const radius = Math.min(CARPET_REVEAL_RADIUS, effectiveLoadRadius());
    const focus = memoryGuardian.focus;

    const pendingLoad = this.urlJobs.filter(
      (job) =>
        job.priority === priority &&
        !job.grower &&
        !job.loading &&
        minPoseDist(job.poses, this.ox, this.oz) <= radius &&
        minPoseDist(job.poses, focus.x, focus.z) <= radius
    );
    // Match grower.reveal(radius) (origin-sorted prefix) so the phase can finish.
    const pendingReveal = this.urlJobs.reduce((n, job) => {
      if (job.priority !== priority || !job.grower) return n;
      return n + (job.grower.pendingRevealCount?.(radius) || 0);
    }, 0);
    if (!pendingLoad.length && pendingReveal === 0) {
      endLoadPhase('carpet');
      this.publishRemain();
      return 0;
    }
    // Defer dense carpet while apartment live-intent owns the stream.
    if (this._shouldDeferLowPrioStream(priority)) return 0;
    // Soft-cap must not leave carpet "running" when the small disk is already empty
    // (handled above). When work remains, wait for wantsLoad like other world growers.
    if (!memoryGuardian.wantsLoad) return 0;

    ensureLoadPhase('carpet', `bg r${Math.round(radius)}`);
    setStreamLabel(`carpet bg r${Math.round(radius)}`);
    let work = 0;
    const budget = createBudget();

    for (const job of pendingLoad.slice(0, maxLoads)) {
      if (job.grower || job.loading) continue;
      job.loading = true;
      try {
        const template = await measureRingItem(job.url, () =>
          throughValve(() => loadGltf(job.url, zoneAwareOptions(job.options, job.poses)))
        );
        if (template && typeof job.options.prepare === 'function') {
          await throughValve(async () => { job.options.prepare(template); });
        }
        // Dense grass: first InstancedMesh capacity 1–4 (not x19/x24) — grow later with yields.
        const carpetOpts = {
          ...zoneAwareOptions(job.options, job.poses),
          firstBatchSize: 2,
          maxBatchSize: 4
        };
        job.grower = template
          ? createGrowingInstancedGltf(
            this.parent,
            template,
            job.poses,
            this.ox,
            this.oz,
            carpetOpts
          )
          : { reveal() { return 0; }, get warmed() { return true; }, async warmup() {} };
        if (template && this.renderer && job.grower.warmup) {
          await measureRingItem('warmup carpet', () =>
            throughValve(() => job.grower.warmup(this.renderer))
          );
        }
        registerGrowerResident(`url:${job.uid || job.url}`, 'world', job.poses, job);
        work += 1;
      } finally {
        job.loading = false;
      }
      await yieldAfterWork();
    }

    if (this._shouldDeferLowPrioStream(priority)) return work;
    if (this.renderer) this.renderer.pauseDraw();
    let passes = 0;
    for (const job of this.urlJobs) {
      if (passes >= maxRevealPasses) break;
      if (!job.grower || job.priority !== priority) continue;
      await ensureGrowerWarmed(job.grower, this.renderer, 'warmup carpet');
      let added = 0;
      // One batch worth per pass — never dump many ensureBatch allocations in one MAP.
      const maxAdd = Math.min(loadGovernor.chunk, 4);
      if (job.grower.reveal(radius, maxAdd) > 0) {
        added += 1;
        await budget.tick();
      }
      if (added) {
        passes += 1;
        work += added;
        if (this.renderer) {
          await measureRingItem('compile carpet', () =>
            throughValve(() => this.renderer.compileSubtree(this.parent))
          );
          this.renderer.resumeDraw();
          await yieldToMain();
          this.renderer.pauseDraw();
        } else {
          await yieldToMain();
        }
      }
    }
    if (this.renderer) this.renderer.resumeDraw();
    const stillReveal = this.urlJobs.reduce((n, job) => {
      if (job.priority !== priority || !job.grower) return n;
      return n + (job.grower.pendingRevealCount?.(radius) || 0);
    }, 0);
    const stillLoad = this.urlJobs.some(
      (job) =>
        job.priority === priority &&
        !job.grower &&
        !job.loading &&
        minPoseDist(job.poses, this.ox, this.oz) <= radius &&
        minPoseDist(job.poses, focus.x, focus.z) <= radius
    );
    if (!stillLoad && stillReveal === 0) endLoadPhase('carpet');
    this.publishRemain();
    return work;
  }

  /**
   * Long-running residency loop: core rings (prio ≤4) + terrain expand with Guardian.
   * Dense carpet is sliced each turn and never gates ring growth.
   * Never pumps above effectiveLoadRadius() (fixed Ultra/Simples preset radius).
   */
  async continueAfter(radius) {
    const core = STREAM_PRIORITY_CORE;
    // Terrain + nature + carpet already run on their own loops; this only expands core rings.
    armFocusRemain();
    this.startTerrainBackground();
    this.startNatureBackground();
    this.startCarpetBackground();
    await this.pumpTo(Math.min(radius, effectiveLoadRadius()), core);
    let r = Math.min(radius, effectiveLoadRadius());
    let dumped = false;

    for (;;) {
      this.publishRemain();
      const remain = this.computeFocusRemain();
      const cap = effectiveLoadRadius();
      // Clamp ring cursor to fixed preset / Guardian cap.
      if (r > cap) r = cap;

      // Nothing left in residency — close phases, do not expand.
      if (remain.total === 0) {
        this.endIdleCorePhases(cap, core);
        if (!dumped) {
          dumpLoadLog();
          dumped = true;
        }
        await yieldToMain();
        continue;
      }

      // Expand toward fixed cap while wantsLoad; end idle phases under soft-cap.
      if (memoryGuardian.wantsLoad) {
        if (r + STREAM_STEP <= cap + 0.01) {
          r = Math.min(r + STREAM_STEP, cap);
        } else if (r < cap) {
          r = cap;
        }
        await this.pumpTo(r, core);
      } else {
        this.endIdleCorePhases(Math.min(r, cap), core);
        this.publishRemain();
      }

      // Always yield — empty pumpTo can be sync and used to spin the tab to death
      // (Chrome STATUS_BREAKPOINT / Aw Snap).
      await yieldToMain();
    }
  }
}
