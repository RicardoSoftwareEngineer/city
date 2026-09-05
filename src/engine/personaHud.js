/**
 * One minimizable HUD panel per persona — overload % + last 10 decisions.
 */

import { getLastDraw } from './loadLog.js';
import { loadGovernor, TARGET_FPS } from './LoadGovernor.js';
import { memoryGuardian } from './memoryGuardian.js';
import {
  PERSONA_IDS,
  getPersonaSnapshot,
  setOverload
} from './personaLog.js';

/** Accent color per persona title */
const PERSONA_COLOR = {
  Guardian: '#f472b6',
  Carregador: '#38bdf8',
  Valve: '#a78bfa',
  Renderer: '#34d399',
  LoadGovernor: '#fbbf24',
  QualityAdapter: '#fb923c'
};

function clampPct(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function barClass(pct) {
  if (pct >= 90) return 'persona-hot';
  if (pct >= 70) return 'persona-warm';
  return 'persona-ok';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Mounts one separate panel per persona (before initMinimizableHud).
 * @param {{ getQuality?: () => { level: number } }} [opts]
 */
export function initPersonaHud(opts = {}) {
  // Remove legacy single panel if still in HTML
  document.getElementById('persona-hud')?.remove();

  /** @type {Map<string, HTMLElement>} */
  const panels = new Map();

  PERSONA_IDS.forEach((id, i) => {
    const sid = slug(id);
    let root = document.querySelector(`[data-min-id="persona-${sid}"]`);
    if (!root) {
      root = document.createElement('div');
      root.className = 'persona-panel';
      root.id = `persona-${sid}`;
      root.setAttribute('data-min-id', `persona-${sid}`);
      root.innerHTML =
        `<button type="button" class="hud-min-toggle persona-label" data-min-toggle ` +
        `style="color:${PERSONA_COLOR[id] || '#94a3b8'}">` +
        `${id} <span data-min-chev>▾</span></button>` +
        `<div data-min-body>` +
        `<div class="persona-card" data-persona="${id}">` +
        `<div class="persona-head">` +
        `<span class="persona-pct" data-pct>—</span>` +
        `</div>` +
        `<div class="persona-track"><div class="persona-fill persona-ok" data-fill style="width:0%"></div></div>` +
        `<ol class="persona-decisions" data-decisions></ol>` +
        `</div></div>`;
      // Default stack top-right so panels don't all sit on the same spot
      // (localStorage position wins after first drag via minimizableHud).
      root.style.top = `${4.5 + i * 7.2}rem`;
      root.style.right = '1rem';
      document.body.appendChild(root);
    }
    panels.set(id, root);
  });

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
      const root = panels.get(id);
      const card = root?.querySelector(`[data-persona="${id}"]`);
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
