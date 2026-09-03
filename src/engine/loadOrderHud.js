/**
 * Left HUD: sync + async load-order lists.
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRows(phases) {
  return phases
    .map((p, i) => {
      const st = p.status;
      const time = st === 'pending' ? '' : `<span class="lo-ms">${fmtMs(p.ms)}</span>`;
      const detail = p.detail
        ? `<span class="lo-detail">${escapeHtml(p.detail)}</span>`
        : '';
      const label = `${i + 1} · ${p.label}`;
      return (
        `<li class="lo-row lo-${st}">` +
        `<span class="lo-glyph">${STATUS_GLYPH[st]}</span>` +
        `<span class="lo-label">${escapeHtml(label)}</span>` +
        time +
        detail +
        `</li>`
      );
    })
    .join('');
}

export function initLoadOrderHud() {
  const asyncList = document.getElementById('load-order-async-list');
  const syncList = document.getElementById('load-order-sync-list');
  if (!asyncList && !syncList) return () => {};

  let shownRev = -1;

  function paint() {
    const rev = getLoadOrderRevision();
    const snap = getLoadOrderSnapshot();
    const hasRunning = snap.phases.some((p) => p.status === 'running');
    if (rev === shownRev && !hasRunning) return;
    shownRev = rev;

    if (asyncList) asyncList.innerHTML = renderRows(snap.async);
    if (syncList) syncList.innerHTML = renderRows(snap.sync);
  }

  return paint;
}
