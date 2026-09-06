/**
 * Quality facade — Ultra / Simples presets only.
 * No live FPS downgrades. apply once on boot + on toggle.
 */

import {
  applyQualityPreset,
  bindQualityRenderer,
  getActivePreset,
  getActivePresetId,
  loadStoredPresetId
} from './qualityPresets.js';
import { memoryGuardian } from './memoryGuardian.js';
import { noteDecision } from './personaLog.js';

let lastZoneNote = '';

/** Zone policy helper — outer ring prefers low-quality intent (logged). */
export function noteZonePolicy(x, z) {
  const inner = memoryGuardian.isInnerZone(x, z);
  const text = inner ? 'zone inner → full intent' : 'zone outer → low intent';
  if (text === lastZoneNote) return;
  lastZoneNote = text;
  noteDecision('QualityAdapter', text);
}

/**
 * @param {{ renderer: import('three').WebGLRenderer }} rendererHost
 */
export function createQualityAdapter(rendererHost) {
  bindQualityRenderer(rendererHost);
  // Boot: prefer Ultra (or last stored). Shadows stay off until resumeShadows.
  const initial = loadStoredPresetId();
  applyQualityPreset(initial, { persist: false, applyShadows: false });

  return {
    /** 0 = Ultra, 1 = Simples (HUD / persona compat). */
    get level() {
      return getActivePresetId() === 'ultra' ? 0 : 1;
    },
    get label() {
      return getActivePreset().label;
    },
    /** No continuous adaptation. */
    tick() {},
    /**
     * @param {'ultra'|'simple'|string} id
     */
    apply(id) {
      return applyQualityPreset(id, { applyShadows: true });
    }
  };
}
