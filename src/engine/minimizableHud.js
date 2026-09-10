/**
 * HUD panels: click title to collapse; drag title to move; corner handles to resize.
 * Persists { min, left, top, width, height } per panel in localStorage.
 *
 * Expects: root[data-min-id], [data-min-toggle], optional [data-min-body].
 * Optional root[data-min-no-collapse]: drag only; click-without-drag activates toggle (.click()).
 */

const STORE_KEY = 'city-hud-panels-v1';
const LEGACY_MIN_KEY = 'city-hud-min';
const DRAG_THRESHOLD = 5;
const CORNERS = ['nw', 'ne', 'sw', 'se'];
/** Floor width (~title chrome); JS clamps — CSS min-width lifted when .is-resized. */
const MIN_WIDTH_PX = 10 * 16;

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
  // Collapsed chrome should shrink to the title bar; keep width if resized.
  if (min) root.style.height = '';
}

function applyPos(root, left, top) {
  if (left == null || top == null || Number.isNaN(left) || Number.isNaN(top)) return;
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';
  root.classList.add('is-placed');
}

function applySize(root, width, height, { skipHeight = false } = {}) {
  let resized = false;
  if (width != null && !Number.isNaN(width)) {
    root.style.width = `${Math.round(width)}px`;
    root.style.boxSizing = 'border-box';
    resized = true;
  }
  if (!skipHeight && height != null && !Number.isNaN(height)) {
    root.style.height = `${Math.round(height)}px`;
    root.style.boxSizing = 'border-box';
    resized = true;
  }
  if (resized) root.classList.add('is-resized');
}

function ensureHandles(root) {
  if (root.querySelector('.hud-resize-handle')) return;
  for (const corner of CORNERS) {
    const handle = document.createElement('div');
    handle.className = 'hud-resize-handle';
    handle.dataset.corner = corner;
    handle.setAttribute('aria-hidden', 'true');
    root.appendChild(handle);
  }
}

function minHeightFor(root, toggle) {
  const th = toggle.offsetHeight || 28;
  const cs = getComputedStyle(root);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  return Math.max(Math.ceil(th + padY + borderY), 28);
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
    const noCollapse = root.hasAttribute('data-min-no-collapse');

    ensureHandles(root);

    if (!noCollapse) {
      applyMin(root, toggle, Boolean(entry.min));
    }
    if (entry.left != null && entry.top != null) {
      applyPos(root, entry.left, entry.top);
    }
    if (entry.width != null || entry.height != null) {
      applySize(root, entry.width, entry.height, {
        skipHeight: !noCollapse && Boolean(entry.min)
      });
    }

    let drag = null;
    let resize = null;

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
        if (noCollapse) {
          // Same DRAG_THRESHOLD pattern: no move → activate (e.g. cycle car).
          if (typeof toggle.click === 'function') toggle.click();
        } else {
          const next = !root.classList.contains('is-min');
          applyMin(root, toggle, next);
          entry.min = next;
          if (!next && entry.height != null) {
            applySize(root, entry.width, entry.height);
          }
          saveState(state);
        }
      }
    };

    toggle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest('.hud-resize-handle')) return;
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

    const onResizeMove = (ev) => {
      if (!resize) return;
      const { corner, startX, startY, originL, originT, originW, originH, minW, minH } = resize;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let w = originW;
      let h = originH;
      let left = originL;
      let top = originT;

      if (corner.includes('e')) w = originW + dx;
      if (corner.includes('w')) w = originW - dx;
      if (corner.includes('s')) h = originH + dy;
      if (corner.includes('n')) h = originH - dy;

      w = Math.max(minW, w);
      h = Math.max(minH, h);

      // Keep the opposite corner anchored after min-size clamp.
      if (corner.includes('w')) left = originL + originW - w;
      if (corner.includes('n')) top = originT + originH - h;

      // Clamp into viewport (size + position).
      if (left < 0) {
        if (corner.includes('w')) {
          w += left;
          left = 0;
        } else {
          left = 0;
        }
      }
      if (top < 0) {
        if (corner.includes('n')) {
          h += top;
          top = 0;
        } else {
          top = 0;
        }
      }

      const maxW = Math.max(minW, window.innerWidth - left);
      const maxH = Math.max(minH, window.innerHeight - top);
      w = clamp(w, minW, maxW);
      h = clamp(h, minH, maxH);

      if (corner.includes('w')) left = originL + originW - w;
      if (corner.includes('n')) top = originT + originH - h;
      left = clamp(left, 0, Math.max(0, window.innerWidth - minW));
      top = clamp(top, 0, Math.max(0, window.innerHeight - minH));

      applyPos(root, left, top);
      applySize(root, w, h);
      resize.left = left;
      resize.top = top;
      resize.width = w;
      resize.height = h;
    };

    const onResizeUp = () => {
      if (!resize) return;
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeUp);
      root.classList.remove('is-resizing');

      if (resize.width != null && resize.height != null) {
        entry.width = Math.round(resize.width);
        entry.height = Math.round(resize.height);
        entry.left = Math.round(resize.left);
        entry.top = Math.round(resize.top);
        saveState(state);
      }
      resize = null;
    };

    for (const handle of root.querySelectorAll('.hud-resize-handle')) {
      handle.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        if (root.classList.contains('is-min')) return;
        ev.preventDefault();
        ev.stopPropagation();

        const rect = root.getBoundingClientRect();
        resize = {
          corner: handle.dataset.corner || 'se',
          startX: ev.clientX,
          startY: ev.clientY,
          originL: rect.left,
          originT: rect.top,
          originW: rect.width,
          originH: rect.height,
          minW: MIN_WIDTH_PX,
          minH: minHeightFor(root, toggle),
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        };
        root.classList.add('is-resizing');
        root.style.zIndex = String(40 + (Date.now() % 1000));
        window.addEventListener('pointermove', onResizeMove);
        window.addEventListener('pointerup', onResizeUp);
      });
    }
  }
}
