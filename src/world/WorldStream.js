/**
 * Streams the city in Chebyshev rings of 10 m around the car.
 * Terrain meshes first via pumpTerrainTo (own radius sweep, mesh-only).
 * Then streets → props → bank → buildings → countryside veg (prio 4) + dense (prio 5).
 */

import { loadGltf } from './AssetLoader.js';
import {
  chebyshev,
  createGrowingInstancedGltf,
  minPoseDist
} from './instancing.js';
import { createBudget, waitIfSlow, waitUntilSmooth, yieldAfterWork, yieldToMain } from './yield.js';
import { loadGovernor } from '../engine/LoadGovernor.js';
import { beginLoad, dumpLoadLog, setStreamLabel } from '../engine/loadLog.js';
import { phaseIdForPriority, tickLoadPhase } from '../engine/loadOrderLog.js';
import { beginRing, endRing, measureRingItem, measureRingItemSync, recordRingItem } from '../engine/ringLoadLog.js';
import { castOpts } from './shadowPolicy.js';

export const STREAM_STEP = 10;

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

  addTask({ dist, priority = 2, run, kind = null }) {
    this.tasks.push({ dist, priority, run, kind, done: false });
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
    const priorities = [0, 1, 2, 3, 4, 5].filter((p) => p <= maxPriority);
    const budget = createBudget();
    beginRing(radius);

    for (const priority of priorities) {
      setStreamLabel(`stream r${radius} p${priority}`);
      beginLoad('stream', `ring ${radius} prio ${priority}`);
      const toLoad = this.urlJobs.filter(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius
      );
      const pendingTpl = this.templateJobs.some(
        (job) =>
          job.priority === priority &&
          !job.grower &&
          minPoseDist(job.poses, this.ox, this.oz) <= radius
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
        await waitIfSlow();
        const template = await measureRingItem(job.url, () => loadGltf(job.url, job.options));
        if (template && typeof job.options.prepare === 'function') {
          job.options.prepare(template);
        }
        const tGrow = performance.now();
        job.grower = template
          ? createGrowingInstancedGltf(
            this.parent,
            template,
            job.poses,
            this.ox,
            this.oz,
            job.options
          )
          : { reveal() { return 0; } };
        if (template) recordRingItem(`instancer ${job.url}`, performance.now() - tGrow);
        await yieldAfterWork();
      }

      for (const job of this.templateJobs) {
        if (job.priority !== priority || job.grower) continue;
        if (minPoseDist(job.poses, this.ox, this.oz) > radius) continue;
        await waitIfSlow();
        measureRingItemSync('template instancer', () => {
          job.grower = createGrowingInstancedGltf(
            this.parent,
            job.template,
            job.poses,
            this.ox,
            this.oz,
            job.options
          );
        });
        await yieldAfterWork();
      }

      if (this.renderer) this.renderer.pauseDraw();
      for (const job of this.urlJobs) {
        if (!job.grower) continue;
        let added = 0;
        while (job.grower.reveal(radius, loadGovernor.chunk) > 0) {
          added += 1;
          await budget.tick();
        }
        if (added && this.renderer) {
          await measureRingItem(`compile urls r${radius} p${priority}`, () =>
            this.renderer.compileSubtree(this.parent)
          );
          this.renderer.resumeDraw();
          await yieldToMain();
          this.renderer.pauseDraw();
        }
      }
      for (const job of this.templateJobs) {
        if (!job.grower) continue;
        let added = 0;
        while (job.grower.reveal(radius, loadGovernor.chunk) > 0) {
          added += 1;
          await budget.tick();
        }
        if (added && this.renderer) {
          await measureRingItem(`compile templates r${radius} p${priority}`, () =>
            this.renderer.compileSubtree(this.parent)
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
        await waitIfSlow();
        await measureRingItem(`task p${priority} d${Math.round(task.dist)}`, () => task.run());
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

      if (!b.grower) {
        if (b.heavy) await waitUntilSmooth(42);
        const template = await measureRingItem(b.url || b.name || 'building', () => b.load());
        await yieldAfterWork();
        if (!template) continue;
        if (b.heavy) await waitUntilSmooth(42);
        b.template = template;
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
        await yieldToMain();
      }

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
      while (b.grower.reveal(radius, loadGovernor.chunk) > 0) {
        added += 1;
        await budget.tick();
      }
      if (added && this.renderer) {
        await measureRingItem(`compile building r${radius}`, () =>
          this.renderer.compileSubtree(this.parent)
        );
        this.renderer.resumeDraw();
        await yieldToMain();
        this.renderer.pauseDraw();
      } else if (added) {
        if (b.heavy) await waitUntilSmooth(42);
        await yieldToMain();
      }
      if (this.renderer) this.renderer.resumeDraw();
    }
  }

  /**
   * Own loading circle for countryside meshes: expand Chebyshev radius and
   * build PlaneGeometry tiles only. Yields when FPS dips. Phys stays on
   * ensureGroundAround under the car.
   */
  async pumpTerrainTo(step = STREAM_STEP) {
    const pending = this.tasks.filter((task) => task.kind === 'terrain' && !task.done);
    if (pending.length === 0) return;

    let max = 0;
    for (const task of pending) {
      if (task.dist > max) max = task.dist;
    }

    const COMPILE_EVERY = 8;
    let sinceCompile = 0;

    const flushCompile = async (label) => {
      if (!sinceCompile || !this.renderer) return;
      this.renderer.pauseDraw();
      await measureRingItem(label, () => this.renderer.compileSubtree(this.parent));
      this.renderer.resumeDraw();
      await yieldToMain();
      sinceCompile = 0;
    };

    for (let r = step; r < max + 0.01; r += step) {
      beginRing(r);
      setStreamLabel(`terrain r${r}`);
      beginLoad('terrain', `ring ${r}`);
      tickLoadPhase('terrain', `r${r}`);

      const batch = pending.filter((task) => !task.done && task.dist <= r);
      for (const task of batch) {
        await waitIfSlow();
        await measureRingItem(
          `terrain mesh d${Math.round(task.dist)}`,
          () => task.run()
        );
        task.done = true;
        sinceCompile += 1;
        await yieldAfterWork();
        if (sinceCompile >= COMPILE_EVERY) {
          await flushCompile(`compile terrain r${r}`);
        }
      }

      endRing(r);
    }

    await flushCompile('compile terrain final');
  }

  async continueAfter(radius) {
    await this.pumpTo(radius, 5);
    const max = this.maxRadius();
    for (let r = radius + STREAM_STEP; r < max + 0.01; r += STREAM_STEP) {
      await this.pumpTo(r);
    }
    dumpLoadLog();
  }
}
