/**
 * Left-side "Carregamento do anel" panel: ring totals + accordion top-10.
 */

import { getRingLoadRevision, getRingLoadSnapshot } from './ringLoadLog.js';

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export function initRingLoadHud() {
  const root = document.getElementById('ring-load-hud');
  const list = document.getElementById('ring-load-list');
  const footer = document.getElementById('ring-load-footer');
  if (!root || !list) return () => {};

  /** @type {Set<number>} */
  const open = new Set();
  let shownRev = -1;

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ring]');
    if (!btn) return;
    const r = Number(btn.getAttribute('data-ring'));
    if (Number.isNaN(r)) return;
    if (open.has(r)) open.delete(r);
    else open.add(r);
    shownRev = -1; // force re-render
    paint();
  });

  function paint() {
    const rev = getRingLoadRevision();
    if (rev === shownRev) return;
    shownRev = rev;
    const snap = getRingLoadSnapshot();

    // Keep the panel short: only the latest rings (highest radius).
    const rings = snap.rings.length > 4 ? snap.rings.slice(-4) : snap.rings;
    list.innerHTML = rings.length
      ? rings
          .map((row) => {
            const isOpen = open.has(row.radius);
            const top = row.top10
              .map(
                (it) =>
                  `<li><span class="ring-item-ms">${fmtMs(it.ms)}</span> ${escapeHtml(it.name)}</li>`
              )
              .join('');
            return (
              `<li class="ring-row${isOpen ? ' is-open' : ''}">` +
              `<button type="button" class="ring-toggle" data-ring="${row.radius}">` +
              `<span class="ring-r">r${row.radius}</span>` +
              `<span class="ring-ms">${fmtMs(row.totalMs)}</span>` +
              `<span class="ring-meta">${row.itemCount} itens · méd ${fmtMs(row.avgMs)}</span>` +
              `<span class="ring-chev">${isOpen ? '▾' : '▸'}</span>` +
              `</button>` +
              (isOpen
                ? `<ol class="ring-top">${top || '<li>sem itens</li>'}</ol>`
                : '') +
              `</li>`
            );
          })
          .join('')
      : '<li class="ring-empty">nenhum anel ainda</li>';

    if (footer) {
      const t = snap.totals;
      const tail = snap.rings.length > 4 ? ' · últimos 4' : '';
      footer.textContent =
        `${t.ringCount} anéis · ${t.itemCount} itens · ${fmtMs(t.elapsedMs)} total${tail}`;
    }
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
