/**
 * Resource bars — what the browser + Three.js can actually measure.
 * System RAM / GPU % / disk from Task Manager are NOT exposed to web pages;
 * those stay labeled as proxies or unavailable.
 *
 * Each row shows 4 trend glyphs; the active one is lit:
 *   ▲ acelerando · ◆ mantendo · ▼ freiando · ■ parado
 */

import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { getLastDraw } from './loadLog.js';
import { memoryGuardian } from './memoryGuardian.js';

const SOFT = {
  tris: 2_500_000,
  calls: 2500,
  textures: 400,
  geometries: 800,
  programs: 120,
  heapMb: 2048
};

/** @type {Map<string, number>} */
const prevSample = new Map();
/** @type {Map<string, number>} */
const flatStreak = new Map();

const TRENDS = [
  { id: 'accel', glyph: '▲', title: 'acelerando' },
  { id: 'hold', glyph: '◆', title: 'mantendo' },
  { id: 'brake', glyph: '▼', title: 'freiando' },
  { id: 'stop', glyph: '■', title: 'parado' }
];

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function barClass(pct) {
  if (pct >= 90) return 'res-hot';
  if (pct >= 70) return 'res-warm';
  return 'res-ok';
}

function heapSample() {
  const m = typeof performance !== 'undefined' ? performance.memory : null;
  if (!m || !m.jsHeapSizeLimit) return null;
  const used = m.usedJSHeapSize / (1024 * 1024);
  const limit = m.jsHeapSizeLimit / (1024 * 1024);
  return { used, limit, pct: clampPct((used / limit) * 100) };
}

async function storageSample() {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    if (!e?.quota) return null;
    const used = (e.usage || 0) / (1024 * 1024);
    const quota = e.quota / (1024 * 1024);
    return { used, quota, pct: clampPct((used / quota) * 100) };
  } catch {
    return null;
  }
}

function trendsHtml(id) {
  return (
    `<span class="res-trends" id="res-${id}-trend" aria-label="tendência">` +
    TRENDS.map(
      (t) =>
        `<span class="res-trend" data-t="${t.id}" title="${t.title}">${t.glyph}</span>`
    ).join('') +
    `</span>`
  );
}

function rowHtml(id, label, tip) {
  return (
    `<div class="res-row" title="${tip}">` +
    `<div class="res-meta"><span class="res-label">${label}</span>` +
    `<span class="res-val" id="res-${id}-val">—</span></div>` +
    `<div class="res-track"><div class="res-fill res-ok" id="res-${id}-fill" style="width:0%"></div></div>` +
    trendsHtml(id) +
    `</div>`
  );
}

/**
 * Classify sample trend vs previous paint.
 * @param {string} id
 * @param {number} value scalar used for the bar (pct or meaningful count)
 * @returns {'accel'|'hold'|'brake'|'stop'}
 */
function classifyTrend(id, value) {
  if (!Number.isFinite(value)) return 'hold';
  const prev = prevSample.get(id);
  prevSample.set(id, value);
  if (prev == null || !Number.isFinite(prev)) return 'hold';

  const d = value - prev;
  const eps = Math.max(0.35, Math.abs(prev) * 0.015);
  if (Math.abs(d) < eps) {
    const n = (flatStreak.get(id) || 0) + 1;
    flatStreak.set(id, n);
    // Near floor + flat for a stretch → completely stopped
    if (value <= eps * 2 && n >= 10) return 'stop';
    // Long absolute freeze (no movement) also counts as stopped
    if (n >= 45) return 'stop';
    return 'hold';
  }
  flatStreak.set(id, 0);
  return d > 0 ? 'accel' : 'brake';
}

function setTrend(id, mode) {
  const root = document.getElementById(`res-${id}-trend`);
  if (!root) return;
  for (const el of root.querySelectorAll('.res-trend')) {
    el.classList.toggle('is-on', el.getAttribute('data-t') === mode);
  }
}

function setBar(id, pct, text, sampleForTrend) {
  const fill = document.getElementById(`res-${id}-fill`);
  const val = document.getElementById(`res-${id}-val`);
  const p = clampPct(pct);
  if (fill) {
    fill.style.width = `${p}%`;
    fill.className = `res-fill ${barClass(p)}`;
  }
  if (val) val.textContent = text;
  const sample = Number.isFinite(sampleForTrend) ? sampleForTrend : p;
  setTrend(id, classifyTrend(id, sample));
}

/**
 * @param {{ getRenderer: () => import('./Renderer.js').Renderer }} opts
 */
export function initResourceHud({ getRenderer }) {
  const root = document.getElementById('resource-hud');
  if (!root) return () => {};

  const body = root.querySelector('[data-min-body]');
  if (body && !body.dataset.ready) {
    body.innerHTML =
      rowHtml('heap', 'Heap JS', 'Memória do JavaScript no Chrome (não é a RAM 32GB do Task Manager)') +
      rowHtml('cpu', 'CPU main', 'Proxy: tempo do frame vs orçamento 60fps (thread principal)') +
      rowHtml('gpu', 'GPU draw', 'Proxy: tempo de renderer.render() vs 16.7ms (espera GPU no main thread)') +
      rowHtml('tris', 'Triângulos', 'Triângulos desenhados no último frame (carga de geometria)') +
      rowHtml('calls', 'Draw calls', 'Chamadas de desenho no último frame') +
      rowHtml('tex', 'Texturas', 'Objetos de textura no renderer.info (proxy de residência GPU)') +
      rowHtml('geo', 'Geometrias', 'Geometrias no renderer.info') +
      rowHtml('prog', 'Programas', 'Shaders GL compilados') +
      rowHtml('store', 'Storage', 'Quota da origem (cache/assets no browser — não é o HD do PC)') +
      rowHtml('guard', 'Guardian', 'Raio de residência adaptativo (min 10m → max 600m) + residentes + motivo') +
      `<div class="res-legend" title="Tendência por linha">▲ acelera · ◆ mantém · ▼ freia · ■ parado</div>` +
      `<div class="res-note" id="res-note">Browser não expõe RAM/GPU%/HD do Windows. Task Manager continua a fonte do sistema.</div>`;
    body.dataset.ready = '1';
  }

  let storage = null;
  let storageAt = 0;
  const deviceGb = navigator.deviceMemory || 0;

  return function paintResourceHud() {
    const now = performance.now();
    if (!storage || now - storageAt > 5000) {
      storageAt = now;
      storageSample().then((s) => {
        storage = s;
      });
    }

    const heap = heapSample();
    if (heap) {
      setBar('heap', heap.pct, `${Math.round(heap.used)}/${Math.round(heap.limit)} MB`, heap.used);
    } else {
      setBar('heap', 0, 'n/d (Chrome)', 0);
    }

    const frameBudget = 1000 / TARGET_FPS;
    const instMs = 1000 / Math.max(loadGovernor.instantFps, 0.1);
    const cpuPct = clampPct((instMs / frameBudget) * 100);
    setBar(
      'cpu',
      Math.min(cpuPct, 100),
      `${Math.round(instMs)}ms · ${Math.round(loadGovernor.instantFps)}fps`,
      instMs
    );

    const draw = getLastDraw();
    const drawMs = draw?.ms || 0;
    const gpuPct = clampPct((drawMs / frameBudget) * 100);
    setBar('gpu', Math.min(gpuPct, 100), `${Math.round(drawMs)}ms`, drawMs);

    const tris = draw?.tris || 0;
    setBar('tris', (tris / SOFT.tris) * 100, `${(tris / 1000).toFixed(0)}k`, tris);

    const calls = draw?.calls || 0;
    setBar('calls', (calls / SOFT.calls) * 100, `${calls}`, calls);

    const renderer = getRenderer?.();
    const info = renderer?.renderer?.info;
    const tex = info?.memory?.textures ?? 0;
    const geo = info?.memory?.geometries ?? 0;
    const prog = info?.programs?.length ?? draw?.programs ?? 0;
    setBar('tex', (tex / SOFT.textures) * 100, `${tex}`, tex);
    setBar('geo', (geo / SOFT.geometries) * 100, `${geo}`, geo);
    setBar('prog', (prog / SOFT.programs) * 100, `${prog}`, prog);

    if (storage) {
      setBar(
        'store',
        storage.pct,
        `${Math.round(storage.used)}/${Math.round(storage.quota)} MB`,
        storage.used
      );
    } else {
      setBar('store', 0, '…', 0);
    }

    const g = memoryGuardian.snapshot();
    // Fill = how close to max residency radius (low fill = aggressive shrink).
    const span = Math.max(1, memoryGuardian.maxRadius - memoryGuardian.minRadius);
    const gPct = Math.round(((g.radius - memoryGuardian.minRadius) / span) * 100);
    const reason = g.adaptReason ? ` · ${g.adaptReason}` : '';
    setBar(
      'guard',
      g.tableFull ? 100 : Math.max(0, gPct),
      `r${Math.round(g.radius)}m [${memoryGuardian.minRadius}–${memoryGuardian.maxRadius}]` +
        ` · ${g.residents}/${g.softCap ?? memoryGuardian.softCap}` +
        ` · p${Math.round(g.pressure * 100)}%` +
        (g.lastEvictCount ? ` · -${g.lastEvictCount}` : '') +
        reason,
      g.radius
    );

    const note = document.getElementById('res-note');
    if (note) {
      const hold = loadGovernor.holding ? ' · VALVE HOLD' : '';
      const stream = loadGovernor.streaming ? ' · streaming' : '';
      const full = g.tableFull ? ' · MESA CHEIA' : '';
      note.textContent =
        (deviceGb ? `deviceMemory ~${deviceGb} GB · ` : '') +
        `Guardian r${Math.round(g.radius)}m [${memoryGuardian.minRadius}–${memoryGuardian.maxRadius}] · ` +
        `heap≠RAM sistema · draw≠GPU% Task Manager${stream}${hold}${full}`;
    }
  };
}
