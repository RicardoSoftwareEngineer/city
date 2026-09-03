/**
 * Left HUD: live load-order phases.
 */

import { getLoadOrderRevision, getLoadOrderSnapshot } from './loadOrderLog.js';

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

const STATUS_GLYPH = {
  pending: '○',
  running: '◉',
  done: '✓'
};

export function initLoadOrderHud() {
  const list = document.getElementById('load-order-list');
  if (!list) return () => {};

  let shownRev = -1;
  let rafDetail = false;

  function paint(force = false) {
    const rev = getLoadOrderRevision();
    const snap = getLoadOrderSnapshot();
    // While something is running, refresh often so ms/detail tick.
    const hasRunning = snap.phases.some((p) => p.status === 'running');
    if (!force && rev === shownRev && !hasRunning) return;
    if (!force && rev === shownRev && hasRunning) {
      // throttle live ms updates via rAF flag from game loop — still paint
    }
    shownRev = rev;

    list.innerHTML = snap.phases
      .map((p) => {
        const st = p.status;
        const time = st === 'pending' ? '' : `<span class="lo-ms">${fmtMs(p.ms)}</span>`;
        const detail = p.detail
          ? `<span class="lo-detail">${escapeHtml(p.detail)}</span>`
          : '';
        return (
          `<li class="lo-row lo-${st}">` +
          `<span class="lo-glyph">${STATUS_GLYPH[st]}</span>` +
          `<span class="lo-label">${escapeHtml(p.label)}</span>` +
          time +
          detail +
          `</li>`
        );
      })
      .join('');
  }

  return paint;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
