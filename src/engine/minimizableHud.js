/**
 * HUD panels: click title to collapse; drag title to move.
 * Persists { min, left, top } per panel in localStorage.
 *
 * Expects: root[data-min-id], [data-min-toggle], optional [data-min-body]
 */

const STORE_KEY = 'city-hud-panels-v1';
const LEGACY_MIN_KEY = 'city-hud-min';
const DRAG_THRESHOLD = 5;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {
    /* ignore */
  }
  // Migrate old session minimize flags once.
  try {
    const legacy = JSON.parse(sessionStorage.getItem(LEGACY_MIN_KEY) || '{}') || {};
    const migrated = {};
    for (const [id, min] of Object.entries(legacy)) {
      migrated[id] = { min: Boolean(min) };
    }
    if (Object.keys(migrated).length) {
      localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
      sessionStorage.removeItem(LEGACY_MIN_KEY);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveState(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function applyMin(root, toggle, min) {
  root.classList.toggle('is-min', min);
  toggle.setAttribute('aria-expanded', min ? 'false' : 'true');
  const chev = toggle.querySelector('[data-min-chev]');
  if (chev) chev.textContent = min ? '▸' : '▾';
}

function applyPos(root, left, top) {
  if (left == null || top == null || Number.isNaN(left) || Number.isNaN(top)) return;
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';
  root.classList.add('is-placed');
}

export function initMinimizableHud() {
  const state = loadState();
  const roots = document.querySelectorAll('[data-min-id]');

  for (const root of roots) {
    const id = root.getAttribute('data-min-id');
    const toggle = root.querySelector('[data-min-toggle]');
    if (!id || !toggle) continue;

    if (!state[id]) state[id] = {};
    const entry = state[id];

    applyMin(root, toggle, Boolean(entry.min));
    if (entry.left != null && entry.top != null) {
      applyPos(root, entry.left, entry.top);
    }

    let drag = null;

    const onMove = (ev) => {
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const dy = ev.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        drag.moved = true;
        root.classList.add('is-dragging');
      }
      if (!drag.moved) return;

      const maxL = Math.max(0, window.innerWidth - root.offsetWidth);
      const maxT = Math.max(0, window.innerHeight - root.offsetHeight);
      const left = clamp(drag.originL + dx, 0, maxL);
      const top = clamp(drag.originT + dy, 0, maxT);
      applyPos(root, left, top);
      drag.left = left;
      drag.top = top;
    };

    const onUp = () => {
      if (!drag) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      root.classList.remove('is-dragging');

      const wasDrag = drag.moved;
      if (wasDrag && drag.left != null && drag.top != null) {
        entry.left = drag.left;
        entry.top = drag.top;
        saveState(state);
      }
      drag = null;

      if (!wasDrag) {
        const next = !root.classList.contains('is-min');
        applyMin(root, toggle, next);
        entry.min = next;
        saveState(state);
      }
    };

    toggle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const rect = root.getBoundingClientRect();
      drag = {
        startX: ev.clientX,
        startY: ev.clientY,
        originL: rect.left,
        originT: rect.top,
        moved: false,
        left: null,
        top: null
      };
      // Promote so it sits above siblings while dragging.
      root.style.zIndex = String(40 + (Date.now() % 1000));
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
