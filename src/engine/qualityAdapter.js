/**
 * Temporary quality ladder — only while FPS is under target.
 * Restores full quality as soon as FPS recovers. Never strips textures.
 * setPixelRatio / shadow toggles can cost the *next* draw (tagged after: quality apply …),
 * especially under system RAM pressure — see Travamentos heap/draw fields.
 */

import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { beginLoad, loadMark } from './loadLog.js';

const BASE_PR_CAP = 2;
const LEVELS = [
  { id: 0, label: 'full', pixelRatio: null, shadows: null },
  { id: 1, label: 'pr↓', pixelRatio: 1.25, shadows: null },
  { id: 2, label: 'pr↓↓', pixelRatio: 1, shadows: null },
  { id: 3, label: 'no-shadow', pixelRatio: 1, shadows: false }
];

export function createQualityAdapter(renderer) {
  let level = 0;
  let lowStreak = 0;
  let highStreak = 0;
  let shadowWanted = false;
  const basePr = Math.min(window.devicePixelRatio || 1, BASE_PR_CAP);

  function apply(next) {
    if (next === level) return;
    const t0 = performance.now();
    beginLoad('quality', `apply ${LEVELS[next].label}`);
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
    loadMark('quality', `apply ${cfg.label}`, performance.now() - t0);
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
      // Freeze ladder while the stream valve owns FPS — toggling pixelRatio/shadows
      // mid-ring caused multi-second draws (quality apply no-shadow) under heavy scenes.
      if (loadGovernor.streaming) {
        lowStreak = 0;
        highStreak = 0;
        return;
      }
      if (loadGovernor.instantFps < TARGET_FPS - 5) {
        lowStreak++;
        highStreak = 0;
        if (lowStreak >= 8 && level < LEVELS.length - 1) {
          apply(level + 1);
          lowStreak = 0;
        }
      } else if (loadGovernor.isSmooth) {
        highStreak++;
        lowStreak = 0;
        if (highStreak >= 20 && level > 0) {
          apply(level - 1);
          highStreak = 0;
        }
      } else {
        lowStreak = 0;
        highStreak = 0;
      }
    }
  };
}
