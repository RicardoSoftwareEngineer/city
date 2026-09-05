/**
 * Temporary quality ladder — only while FPS is under target.
 * Restores full quality as soon as FPS recovers. Never strips textures.
 * Always adapts (including while streaming). setPixelRatio / shadow toggles
 * can cost the *next* draw — apply only when the valve is not holding, and
 * pauseDraw briefly around the mutate if available.
 */

import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { beginLoad, loadMark } from './loadLog.js';
import { noteDecision } from './personaLog.js';
import { memoryGuardian } from './memoryGuardian.js';

const BASE_PR_CAP = 2;
const LEVELS = [
  { id: 0, label: 'full', pixelRatio: null, shadows: null },
  { id: 1, label: 'pr↓', pixelRatio: 1.25, shadows: null },
  { id: 2, label: 'pr↓↓', pixelRatio: 1, shadows: null },
  { id: 3, label: 'no-shadow', pixelRatio: 1, shadows: false }
];

let lastZoneNote = '';

/** Zone policy helper — outer ring prefers low-quality intent (logged). */
export function noteZonePolicy(x, z) {
  const inner = memoryGuardian.isInnerZone(x, z);
  const text = inner ? 'zone inner → full intent' : 'zone outer → low intent';
  if (text === lastZoneNote) return;
  lastZoneNote = text;
  noteDecision('QualityAdapter', text);
}

export function createQualityAdapter(renderer) {
  let level = 0;
  let lowStreak = 0;
  let highStreak = 0;
  let shadowWanted = false;
  const basePr = Math.min(window.devicePixelRatio || 1, BASE_PR_CAP);

  function apply(next) {
    if (next === level) return false;
    // Avoid conflicting with loader HOLD / mid-draw; retry next tick.
    if (loadGovernor.holding) return false;
    const canPause = typeof renderer.pauseDraw === 'function';
    if (canPause) renderer.pauseDraw();
    const t0 = performance.now();
    beginLoad('quality', `apply ${LEVELS[next].label}`);
    try {
      level = next;
      const cfg = LEVELS[level];
      const pr = cfg.pixelRatio == null ? basePr : Math.min(basePr, cfg.pixelRatio);
      renderer.renderer.setPixelRatio(pr);
      if (cfg.shadows === false) {
        shadowWanted = renderer.renderer.shadowMap.enabled;
        renderer.renderer.shadowMap.enabled = false;
      } else if (level === 0 && shadowWanted) {
        renderer.renderer.shadowMap.enabled = true;
        shadowWanted = false;
      }
      noteDecision('QualityAdapter', `apply ${cfg.label}`);
      loadMark('quality', `apply ${cfg.label}`, performance.now() - t0);
      return true;
    } finally {
      if (canPause) renderer.resumeDraw();
    }
  }

  return {
    get level() {
      return level;
    },
    get label() {
      return LEVELS[level].label;
    },
    /** Call once per frame after loadGovernor.noteFrame. */
    tick() {
      if (loadGovernor.instantFps < TARGET_FPS - 5) {
        lowStreak++;
        highStreak = 0;
        if (lowStreak >= 8 && level < LEVELS.length - 1) {
          if (apply(level + 1)) lowStreak = 0;
        }
      } else if (loadGovernor.isSmooth) {
        highStreak++;
        lowStreak = 0;
        if (highStreak >= 20 && level > 0) {
          if (apply(level - 1)) highStreak = 0;
        }
      } else {
        lowStreak = 0;
        highStreak = 0;
      }
    }
  };
}
