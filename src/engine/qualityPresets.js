/**
 * Fixed quality presets — Ultra / Simples (commercial-game style).
 * Apply once on boot and on UI toggle. Hardware owns actual FPS;
 * nothing here climbs/shrinks from measured frame times.
 */

import { noteDecision } from './personaLog.js';

const STORAGE_KEY = 'city.qualityPreset';

/** @typedef {'ultra'|'simple'} PresetId */

/**
 * @typedef {object} QualityPreset
 * @property {PresetId} id
 * @property {string} label
 * @property {number} radius           Fixed residency radius (streets/veg/buildings)
 * @property {number} playCoreRadius   Near disk for load-tile / Foco completo (gate outer rings)
 * @property {number} softCap          Soft resident table cap (non-terrain)
 * @property {number} instanceBatch
 * @property {number} chunk
 * @property {number} budgetMs
 * @property {number} mergeStride
 * @property {number} yieldEvery
 * @property {number} pixelRatioCap
 * @property {boolean} shadows
 * @property {number} vegSpacingScale  >1 = sparser scatter (Simples)
 * @property {number} vegPoseCapScale  <1 = fewer poses (Simples)
 */

/** @type {Record<PresetId, QualityPreset>} */
export const PRESETS = {
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    // Smaller play circle + playCore gate (spec 02); vista terrain still fence-scale.
    radius: 480,
    playCoreRadius: 160,
    softCap: 280,
    instanceBatch: 32,
    chunk: 16,
    budgetMs: 5,  // hard stream ms/frame (spec 4–6)
    mergeStride: 14,
    yieldEvery: 2,
    pixelRatioCap: 2,
    shadows: true,
    vegSpacingScale: 1,
    vegPoseCapScale: 1
  },
  simple: {
    id: 'simple',
    label: 'Simples',
    radius: 220,
    playCoreRadius: 100,
    softCap: 140,
    instanceBatch: 12,
    chunk: 4,
    budgetMs: 2.5,  // hard stream ms/frame (spec 2–3)
    mergeStride: 4,
    yieldEvery: 1,
    pixelRatioCap: 1,
    shadows: false,
    vegSpacingScale: 1.75,
    vegPoseCapScale: 0.4
  }
};

/** @type {PresetId} */
let activeId = 'ultra';
/** @type {{ renderer: { setPixelRatio: Function }, shadowMap: { enabled: boolean, needsUpdate?: boolean } } | null} */
let gl = null;
/** @type {Array<(p: QualityPreset) => void>} */
const listeners = [];

export function getActivePreset() {
  return PRESETS[activeId] || PRESETS.ultra;
}

export function getActivePresetId() {
  return activeId;
}

/** Prefer Ultra when unset / corrupt. */
export function loadStoredPresetId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id === 'ultra' || id === 'simple') return id;
  } catch {
    /* ignore */
  }
  return 'ultra';
}

/**
 * Bind the Three.js WebGLRenderer so apply can set pixelRatio / shadows.
 * @param {{ renderer: import('three').WebGLRenderer }} host
 */
export function bindQualityRenderer(host) {
  gl = host?.renderer || null;
}

export function onPresetChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/**
 * Apply a preset once. No continuous FPS ladder afterward.
 * @param {PresetId|string} id
 * @param {{ persist?: boolean, applyShadows?: boolean }} [opts]
 *   applyShadows: false during early boot (resumeShadows owns first enable).
 */
export function applyQualityPreset(id, opts = {}) {
  const { persist = true, applyShadows = true } = opts;
  const preset = PRESETS[id] || PRESETS.ultra;
  activeId = preset.id;

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, activeId);
    } catch {
      /* ignore */
    }
  }

  if (gl) {
    const pr = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap);
    gl.setPixelRatio(pr);
    if (applyShadows) {
      gl.shadowMap.enabled = !!preset.shadows;
      if (preset.shadows && 'needsUpdate' in gl.shadowMap) {
        gl.shadowMap.needsUpdate = true;
      }
    }
  }

  noteDecision('QualityAdapter', `preset ${preset.label}`);
  for (const fn of listeners.slice()) {
    try {
      fn(preset);
    } catch {
      /* ignore */
    }
  }
  return preset;
}

/** Sync aria-pressed on Ultra / Simples buttons if present. */
export function syncQualityPresetButtons() {
  const id = getActivePresetId();
  const pressed = (want) => (id === want ? 'true' : 'false');
  document.getElementById('quality-ultra-btn')?.setAttribute('aria-pressed', pressed('ultra'));
  document.getElementById('quality-simple-btn')?.setAttribute('aria-pressed', pressed('simple'));
  document.querySelectorAll('[data-quality-mirror]').forEach((el) => {
    el.setAttribute('aria-pressed', pressed(el.getAttribute('data-quality-mirror')));
  });
}

/**
 * Wire UI buttons (boot gate + HUD mirrors). Returns teardown.
 * @param {(id: PresetId) => void} [onChange]
 */
export function bindQualityPresetUi(onChange) {
  const pick = (id) => {
    applyQualityPreset(id, { applyShadows: true });
    syncQualityPresetButtons();
    onChange?.(id);
  };

  /** @type {Array<[Element, EventListener]>} */
  const bound = [];
  const wire = (el, id) => {
    if (!el) return;
    const fn = () => pick(id);
    el.addEventListener('click', fn);
    bound.push([el, fn]);
  };

  wire(document.getElementById('quality-ultra-btn'), 'ultra');
  wire(document.getElementById('quality-simple-btn'), 'simple');
  document.querySelectorAll('[data-quality-mirror]').forEach((el) => {
    const id = el.getAttribute('data-quality-mirror');
    if (id === 'ultra' || id === 'simple') wire(el, id);
  });
  syncQualityPresetButtons();

  return () => {
    for (const [el, fn] of bound) el.removeEventListener('click', fn);
  };
}
