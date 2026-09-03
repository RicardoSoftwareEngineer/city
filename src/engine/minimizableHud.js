/**
 * Click a panel's title to collapse/expand its body.
 * Expects: root[data-min-id], title.el [data-min-toggle], body [data-min-body]
 */

const STORE_KEY = 'city-hud-min';

function loadState() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function initMinimizableHud() {
  const state = loadState();
  const roots = document.querySelectorAll('[data-min-id]');

  for (const root of roots) {
    const id = root.getAttribute('data-min-id');
    const toggle = root.querySelector('[data-min-toggle]');
    if (!id || !toggle) continue;

    const apply = (min) => {
      root.classList.toggle('is-min', min);
      toggle.setAttribute('aria-expanded', min ? 'false' : 'true');
      const chev = toggle.querySelector('[data-min-chev]');
      if (chev) chev.textContent = min ? '▸' : '▾';
    };

    apply(Boolean(state[id]));

    toggle.addEventListener('click', () => {
      const next = !root.classList.contains('is-min');
      apply(next);
      state[id] = next;
      saveState(state);
    });
  }
}
