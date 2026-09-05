/**
 * Persona panel — overload % + last 10 decisions per actor.
 */

import { getLastDraw } from './loadLog.js';
import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { memoryGuardian } from './memoryGuardian.js';
import {
  PERSONA_IDS,
  getPersonaSnapshot,
  setOverload
} from './personaLog.js';

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function barClass(pct) {
  if (pct >= 90) return 'persona-hot';
  if (pct >= 70) return 'persona-warm';
  return 'persona-ok';
}

/**
 * @param {{ getQuality?: () => { level: number } }} [opts]
 */
export function initPersonaHud(opts = {}) {
  const root = document.getElementById('persona-hud');
  if (!root) return () => {};

  const body = root.querySelector('[data-min-body]');
  if (body && !body.dataset.ready) {
    body.innerHTML = PERSONA_IDS.map(
      (id) =>
        `<div class="persona-card" data-persona="${id}">` +
        `<div class="persona-head">` +
        `<span class="persona-name">${id}</span>` +
        `<span class="persona-pct" data-pct>—</span>` +
        `</div>` +
        `<div class="persona-track"><div class="persona-fill persona-ok" data-fill style="width:0%"></div></div>` +
        `<ol class="persona-decisions" data-decisions></ol>` +
        `</div>`
    ).join('');
    body.dataset.ready = '1';
  }

  return function paintPersonaHud() {
    const g = memoryGuardian.snapshot();
    const draw = getLastDraw();
    const quality = opts.getQuality?.();

    setOverload(
      'Guardian',
      Math.max(g.pressure * 100, (g.residents / memoryGuardian.softCap) * 100)
    );
    setOverload(
      'LoadGovernor',
      Math.max(
        loadGovernor.loadPercent,
        (1 - loadGovernor.fps / TARGET_FPS) * 100
      )
    );
    setOverload('Valve', loadGovernor.holding ? 100 : 0);
    setOverload(
      'QualityAdapter',
      ((quality?.level ?? 0) / 3) * 100
    );
    setOverload(
      'Carregador',
      loadGovernor.streaming && !memoryGuardian.wantsLoad
        ? 80
        : loadGovernor.streaming
          ? 40
          : 10
    );
    setOverload(
      'Renderer',
      Math.min(100, ((draw?.ms || 0) / 16.7) * 100)
    );

    for (const id of PERSONA_IDS) {
      const snap = getPersonaSnapshot(id);
      const card = body?.querySelector(`[data-persona="${id}"]`);
      if (!card) continue;
      const pct = clampPct(snap.overload);
      const pctEl = card.querySelector('[data-pct]');
      const fill = card.querySelector('[data-fill]');
      const list = card.querySelector('[data-decisions]');
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (fill) {
        fill.style.width = `${pct}%`;
        fill.className = `persona-fill ${barClass(pct)}`;
      }
      if (list) {
        list.innerHTML = snap.decisions.length
          ? snap.decisions.map((d) => `<li>${escapeHtml(d)}</li>`).join('')
          : '<li class="persona-empty">—</li>';
      }
    }
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
