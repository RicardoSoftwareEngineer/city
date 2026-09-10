/**
 * Left HUD: sync + async load-order lists + numbered remaining queue.
 * Sync is phys-under-car only; spawn streets and the rest are async.
 */

import { getLoadOrderRevision, getLoadOrderSnapshot } from './loadOrderLog.js';
import { getFocusRemainRevision, getFocusRemainSnapshot } from './focusRemain.js';

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
        `<span class="lo-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>` +
        time +
        detail +
        `</li>`
      );
    })
    .join('');
}

function renderRemain(snap) {
  const statusEl = document.getElementById('load-remain-status');
  const listEl = document.getElementById('load-remain-list');
  const totalEl = document.getElementById('load-remain-total');
  const optHead = document.getElementById('load-remain-optional-head');
  const optList = document.getElementById('load-remain-optional');
  if (!statusEl && !listEl && !totalEl) return;

  const total = snap.total | 0;
  const done = snap.done | 0;
  const denom = done + total;
  const progress = denom > 0 ? `${done}/${denom}` : `${done}/—`;
  const optional = (snap.optional || []).filter((it) => it.count > 0);

  const stageEl = document.getElementById('play-stage-status');
  if (stageEl) {
    if (snap.stage === 'foco-completo' || snap.focusReady) {
      stageEl.textContent = 'Foco completo';
      stageEl.className = 'play-stage play-stage-full';
    } else if (snap.playableMin || snap.stage === 'minimo-jogavel') {
      stageEl.textContent = 'Mínimo jogável';
      stageEl.className = 'play-stage play-stage-min';
    } else if (snap.stage === 'idle') {
      stageEl.textContent = 'Pronto para Começar';
      stageEl.className = 'play-stage play-stage-idle';
    } else {
      stageEl.textContent = 'Carregando…';
      stageEl.className = 'play-stage play-stage-busy';
    }
  }

  if (statusEl) {
    if (snap.focusReady || snap.stage === 'foco-completo') {
      statusEl.textContent = 'Foco completo';
      statusEl.className = 'lo-remain-status lo-remain-ready';
    } else if (snap.playableMin) {
      statusEl.textContent = total > 0 ? `Mínimo jogável · faltam ${total}` : 'Mínimo jogável';
      statusEl.className = 'lo-remain-status lo-remain-min';
    } else if (total > 0) {
      statusEl.textContent = `Faltam ${total} itens`;
      statusEl.className = 'lo-remain-status lo-remain-busy';
    } else {
      statusEl.textContent = 'Aguardando foco…';
      statusEl.className = 'lo-remain-status lo-remain-busy';
    }
  }

  if (totalEl) {
    const r = Math.round(snap.radius || 0);
    const freeze = snap.frozen ? ' · raio fixo' : '';
    totalEl.textContent = `Restante ${total} · feito/total ${progress} · r${r}m${freeze}`;
  }

  if (listEl) {
    if (!snap.items?.length) {
      listEl.innerHTML = '<li class="lo-row lo-done"><span class="lo-glyph">✓</span><span class="lo-label">Nada pendente neste foco</span></li>';
    } else {
      listEl.innerHTML = snap.items
        .map((it, i) => {
          const label = `${i + 1} · ${it.label}`;
          return (
            `<li class="lo-row lo-running">` +
            `<span class="lo-glyph">◉</span>` +
            `<span class="lo-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>` +
            `<span class="lo-ms">${it.count}</span>` +
            `</li>`
          );
        })
        .join('');
    }
  }

  if (optHead) {
    optHead.hidden = optional.length === 0;
  }
  if (optList) {
    if (!optional.length) {
      optList.innerHTML = '';
      optList.hidden = true;
    } else {
      optList.hidden = false;
      optList.innerHTML = optional
        .map((it, i) => {
          const label = `${i + 1} · ${it.label}`;
          return (
            `<li class="lo-row lo-optional">` +
            `<span class="lo-glyph">○</span>` +
            `<span class="lo-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>` +
            `<span class="lo-ms">${it.count}</span>` +
            `</li>`
          );
        })
        .join('');
    }
  }
}

export function initLoadOrderHud() {
  const asyncList = document.getElementById('load-order-async-list');
  const syncList = document.getElementById('load-order-sync-list');
  if (!asyncList && !syncList) return () => {};

  let shownRev = -1;
  let shownRemainRev = -1;

  function paint() {
    const rev = getLoadOrderRevision();
    const remainRev = getFocusRemainRevision();
    const snap = getLoadOrderSnapshot();
    const hasRunning = snap.phases.some((p) => p.status === 'running');
    if (rev !== shownRev || hasRunning) {
      shownRev = rev;
      if (asyncList) asyncList.innerHTML = renderRows(snap.async);
      if (syncList) syncList.innerHTML = renderRows(snap.sync);
    }
    if (remainRev !== shownRemainRev) {
      shownRemainRev = remainRev;
      renderRemain(getFocusRemainSnapshot());
    }
  }

  return paint;
}
