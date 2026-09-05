/**
 * Streams the city in Chebyshev rings of 10 m around the car.
 * Terrain meshes run on a continuous background loop (never gated by street pumps).
 * Then streets → props → bank → buildings → countryside veg (prio ≤4).
 * Dense carpet (prio 5) is background-only — never blocks radius expansion.
 */

import { loadGltf } from './AssetLoader.js';
import {
  chebyshev,
  createGrowingInstancedGltf,
  minPoseDist
} from './instancing.js';
import { createBudget, throughValve, waitUntilSmooth, yieldAfterWork, yieldToMain } from './yield.js';
import { memoryGuardian } from '../engine/memoryGuardian.js';
import { loadGovernor } from '../engine/LoadGovernor.js';
import { beginLoad, dumpLoadLog, setStreamLabel } from '../engine/loadLog.js';
import { phaseIdForPriority, tickLoadPhase, endLoadPhase } from '../engine/loadOrderLog.js';
import { beginRing, endRing, measureRingItem, measureRingItemSync, recordRingItem } from '../engine/ringLoadLog.js';
import { castOpts } from './shadowPolicy.js';
import { noteDecision } from '../engine/personaLog.js';
import { noteZonePolicy } from '../engine/qualityAdapter.js';

export const STREAM_STEP = 10;
/** Max priority that may gate ring expansion (streets…base veg). */
export const STREAM_PRIORITY_CORE = 4;
/** Dense grass carpet — background slices only. */
export const STREAM_PRIORITY_CARPET = 5;

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

function registerGrowerResident(id, kind, poses, job) {
  if (!job?.grower || typeof job.grower.dispose !== 'function') return;
  const c = posesCentroid(poses);
  memoryGuardian.retain(id, {
    kind,
    x: c.x,
    z: c.z,
    poses,
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
  }

  addUrl(url, poses, options = {}, priority = 0) {
    if (!url || !poses?.length) return;
    this.urlJobs.push({
      url,
      poses,
      options,
      priority,
      grower: null
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

  async pumpTo(radius, maxPriority = 5) {
    const now = performance.now();
    if (!memoryGuardian.wantsLoad) {
      if (now - this._lastWantsNote > 2000) {
        noteDecision('Carregador', 'wantsLoad false');
        this._lastWantsNote = now;
      }
      return;
    }
    if (now - this._lastPumpNote > 2000) {
      noteDecision('Carregador', `pump r${Math.round(radius)}`);
      this._lastPumpNote = now;
    }
    const capped = Math.min(radius, memoryGuardian.radius);
    radius = capped;
    const priorities = [0, 1, 2, 3, 4, 5].filter((p) => p <= maxPriority);
    const budget = createBudget();
    const focus = memoryGuardian.focus;
    beginRing(radius);

    for (const priority of priorities) {
      setStreamLabel(`stream r${radius} p${priority}`);
      beginLoad('stream', `ring ${radius} prio ${priority}`);
      const toLoad = this.urlJobs.filter(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius &&
          minPoseDist(job.poses, focus.x, focus.z) <= memoryGuardian.radius
      );
      const pendingTpl = this.templateJobs.some(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius &&
          minPoseDist(job.poses, focus.x, focus.z) <= memoryGuardian.radius
      );
      const pendingTasks = this.tasks.some(
        (task) =>
          !task.done &&
          task.kind !== 'terrain' &&
          task.priority === priority &&
          task.dist <= radius
      );
      const mayReveal =
        this.urlJobs.some((job) => job.priority === priority && job.grower) ||
        this.templateJobs.some((job) => job.priority === priority && job.grower) ||
        (priority === 3 && this.buildings.some((b) => b.sorted.length));
      const phaseId = phaseIdForPriority(priority);
      if (
        phaseId &&
        (toLoad.length || pendingTpl || pendingTasks || mayReveal)
      ) {
        tickLoadPhase(phaseId, `r${radius}`);
      }

      for (const job of toLoad) {
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
          : { reveal() { return 0; } };
        if (template) recordRingItem(`instancer ${job.url}`, performance.now() - tGrow);
        if (template && this.renderer && job.grower.warmup) {
          await measureRingItem(`warmup ${job.url.split('/').pop() || 'url'}`, () =>
            throughValve(() => job.grower.warmup(this.renderer))
          );
        }
        registerGrowerResident(`url:${job.url}`, 'world', job.poses, job);
        await yieldAfterWork();
      }

      for (const job of this.templateJobs) {
        if (job.priority !== priority || job.grower) continue;
        if (minPoseDist(job.poses, this.ox, this.oz) > radius) continue;
        if (minPoseDist(job.poses, focus.x, focus.z) > memoryGuardian.radius) continue;
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
    }
    endRing(radius);
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
   * Build terrain tiles currently allowed by MemoryGuardian (car circle).
   * Returns how many tiles were successfully built this call.
   */
  async pumpTerrainSlice(maxTiles = 12) {
    const focus = memoryGuardian.focus;
    const pending = this.tasks
      .filter(
        (task) =>
          task.kind === 'terrain' &&
          !task.done &&
          task.x != null &&
          memoryGuardian.allowsAt(task.x, task.z)
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
      this.renderer.pauseDraw();
      await measureRingItem(label, () =>
        throughValve(() => this.renderer.compileSubtree(this.parent))
      );
      this.renderer.resumeDraw();
      await yieldToMain();
      sinceCompile = 0;
    };

    setStreamLabel(`terrain r${Math.round(memoryGuardian.radius)}`);
    tickLoadPhase('terrain', `r${Math.round(memoryGuardian.radius)}`);

    for (const task of pending) {
      if (built >= maxTiles || !memoryGuardian.wantsTerrainLoad) break;
      if (!memoryGuardian.allowsAt(task.x, task.z)) continue;

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

  /** True once at least one in-circle terrain tile has been built (carpet may start). */
  hasNearTerrainProgress() {
    return this.tasks.some(
      (t) => t.kind === 'terrain' && t.done && t.x != null && memoryGuardian.allowsAt(t.x, t.z)
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
        tickLoadPhase('terrain', `bg r${Math.round(memoryGuardian.radius)}`);
        const n = await this.pumpTerrainSlice(16);
        if (n === 0) {
          // In-radius pending only — outside allowsAt are blocked by radius, not soft-cap.
          const pendingInRadius = this.tasks.some(
            (t) =>
              t.kind === 'terrain' &&
              !t.done &&
              t.x != null &&
              memoryGuardian.allowsAt(t.x, t.z)
          );
          if (!pendingInRadius) endLoadPhase('terrain');
          await yieldToMain();
        }
      }
    };
    void loop().catch((err) => console.error('terrain background failed:', err));
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
    const radius = memoryGuardian.radius;
    const focus = memoryGuardian.focus;
    if (!memoryGuardian.wantsLoad) return 0;

    const pendingLoad = this.urlJobs.filter(
      (job) =>
        job.priority === priority &&
        !job.grower &&
        minPoseDist(job.poses, this.ox, this.oz) <= radius &&
        minPoseDist(job.poses, focus.x, focus.z) <= radius
    );

    tickLoadPhase('carpet', `bg r${Math.round(radius)}`);
    setStreamLabel(`carpet bg r${Math.round(radius)}`);
    let work = 0;
    const budget = createBudget();

    for (const job of pendingLoad.slice(0, maxLoads)) {
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
        : { reveal() { return 0; } };
      if (template && this.renderer && job.grower.warmup) {
        await measureRingItem('warmup carpet', () =>
          throughValve(() => job.grower.warmup(this.renderer))
        );
      }
      registerGrowerResident(`url:${job.url}`, 'world', job.poses, job);
      work += 1;
      await yieldAfterWork();
    }

    if (this.renderer) this.renderer.pauseDraw();
    let passes = 0;
    for (const job of this.urlJobs) {
      if (passes >= maxRevealPasses) break;
      if (!job.grower || job.priority !== priority) continue;
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
    if (!pendingLoad.length && work === 0) endLoadPhase('carpet');
    return work;
  }

  /**
   * Long-running residency loop: core rings (prio ≤4) + terrain expand with Guardian.
   * Dense carpet is sliced each turn and never gates ring growth.
   */
  async continueAfter(radius) {
    const core = STREAM_PRIORITY_CORE;
    // Terrain + carpet already run on their own loops; this only expands core rings.
    this.startTerrainBackground();
    this.startCarpetBackground();
    await this.pumpTo(Math.min(radius, memoryGuardian.radius), core);
    let r = Math.min(radius, memoryGuardian.radius);
    let dumped = false;

    for (;;) {
      if (memoryGuardian.wantsLoad) {
        const cap = memoryGuardian.radius;
        if (r + STREAM_STEP <= cap + 0.01) {
          r = Math.min(r + STREAM_STEP, cap);
          await this.pumpTo(r, core);
        } else if (r < cap) {
          r = cap;
          await this.pumpTo(r, core);
        } else if (!dumped) {
          dumpLoadLog();
          dumped = true;
        }
      }

      // Always yield — empty pumpTo can be sync and used to spin the tab to death
      // (Chrome STATUS_BREAKPOINT / Aw Snap).
      await yieldToMain();
    }
  }
}
