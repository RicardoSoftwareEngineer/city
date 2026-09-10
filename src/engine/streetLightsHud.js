/**
 * Minimizable street-lighting study HUD — live knobs for StreetLightsController.
 * Wire before initMinimizableHud so [data-min-id="street-lights"] is scanned.
 * Persists all params + per-row on/off to localStorage (STORAGE_KEY).
 */

import {
  DEFAULT_PARAMS,
  STORAGE_KEY,
  loadStoredStreetLights,
  saveStoredStreetLights,
  clearStoredStreetLights
} from '../world/StreetLightsController.js';

/** @typedef {keyof typeof DEFAULT_PARAMS | 'enabledSpot' | 'enabledPoint' | 'enabledEmissive'} ParamKey */

const ROWS = [
  {
    key: 'color',
    label: 'Cor',
    kind: 'color',
    enableFlag: null
  },
  {
    key: 'intensity',
    label: 'Intensidade (spot)',
    kind: 'number',
    min: 0,
    max: 500,
    step: 0.1,
    enableFlag: 'enabledSpot'
  },
  {
    key: 'distance',
    label: 'Distância (spot)',
    kind: 'number',
    min: 1,
    max: 500,
    step: 0.5,
    enableFlag: null
  },
  {
    key: 'decay',
    label: 'Decaimento (spot)',
    kind: 'number',
    min: 0,
    max: 20,
    step: 0.05,
    enableFlag: null
  },
  {
    key: 'angle',
    label: 'Ângulo',
    kind: 'number',
    min: 0.05,
    max: 1.57,
    step: 0.01,
    enableFlag: null
  },
  {
    key: 'penumbra',
    label: 'Penumbra',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    enableFlag: null
  },
  {
    key: 'pointIntensity',
    label: 'Intensidade (ponto)',
    kind: 'number',
    min: 0,
    max: 500,
    step: 0.1,
    enableFlag: 'enabledPoint'
  },
  {
    key: 'pointDistance',
    label: 'Distância (ponto)',
    kind: 'number',
    min: 1,
    max: 500,
    step: 0.5,
    enableFlag: null
  },
  {
    key: 'pointDecay',
    label: 'Decaimento (ponto)',
    kind: 'number',
    min: 0,
    max: 20,
    step: 0.05,
    enableFlag: null
  },
  {
    key: 'emissiveMul',
    label: 'Emissivo (lâmpada)',
    kind: 'number',
    min: 0,
    max: 50,
    step: 0.05,
    enableFlag: 'enabledEmissive'
  },
  {
    key: 'aimAlong',
    label: 'Mira (rua)',
    kind: 'number',
    min: -100,
    max: 100,
    step: 0.5,
    enableFlag: null
  },
  {
    key: 'groundY',
    label: 'Solo Y',
    kind: 'number',
    min: -50,
    max: 50,
    step: 0.05,
    enableFlag: null
  },
  {
    key: 'maxLights',
    label: 'Máx. luzes',
    kind: 'number',
    min: 1,
    max: 8,
    step: 1,
    enableFlag: null
  }
];

function hexFromNum(n) {
  return `#${(Number(n) >>> 0).toString(16).padStart(6, '0')}`;
}

function numFromHex(s) {
  const t = String(s || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return null;
  return parseInt(t, 16) >>> 0;
}

function formatNum(n, step) {
  if (!Number.isFinite(n)) return '';
  if (step >= 1) return String(Math.round(n));
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 2;
  return String(Number(n.toFixed(decimals)));
}

/**
 * @param {{ getParams: () => object, setParams: (p: object) => object }} streetLights
 */
export function initStreetLightsHud(streetLights) {
  if (!streetLights?.getParams || !streetLights?.setParams) return;

  let root = document.getElementById('street-lights-hud');
  if (!root) {
    root = document.createElement('div');
    root.id = 'street-lights-hud';
    root.setAttribute('data-min-id', 'street-lights');
    root.setAttribute('aria-label', 'Iluminação dos postes');
    document.body.appendChild(root);
  } else {
    root.setAttribute('data-min-id', 'street-lights');
  }
  root.classList.add('hud-list-panel');

  /** @type {Map<string, number | string>} last value while row toggle is off */
  const remembered = new Map();
  /** @type {Map<string, boolean>} per-row enable (structural params) */
  const rowOn = new Map();

  const stored = loadStoredStreetLights();
  // Controller already merged params on create; re-apply so missing keys fall back
  // to DEFAULT_PARAMS and HUD bind restores the same snapshot after refresh.
  const mergedParams = {
    ...DEFAULT_PARAMS,
    ...(stored?.params && typeof stored.params === 'object' ? stored.params : {}),
    ...streetLights.getParams()
  };

  const params0 = { ...mergedParams };
  const storedRowOn =
    stored?.rowOn && typeof stored.rowOn === 'object' ? stored.rowOn : null;
  for (const row of ROWS) {
    let on = true;
    if (storedRowOn && Object.prototype.hasOwnProperty.call(storedRowOn, row.key)) {
      on = Boolean(storedRowOn[row.key]);
    } else if (row.enableFlag && params0[row.enableFlag] === false) {
      on = false;
    }
    rowOn.set(row.key, on);
    if (row.enableFlag) {
      mergedParams[row.enableFlag] = on;
    }
  }
  streetLights.setParams(mergedParams);

  root.innerHTML =
    `<button type="button" class="hud-min-toggle" id="street-lights-label" data-min-toggle>` +
    `Iluminação <span data-min-chev>▾</span></button>` +
    `<div data-min-body class="sl-body hud-scroll-list">` +
    `<div class="sl-rows"></div>` +
    `<button type="button" id="street-lights-reset" class="sl-reset">Restaurar padrão</button>` +
    `</div>`;

  const rowsEl = root.querySelector('.sl-rows');
  const resetBtn = root.querySelector('#street-lights-reset');

  /** @type {Map<string, { row: HTMLElement, toggle: HTMLInputElement, range?: HTMLInputElement, num?: HTMLInputElement, color?: HTMLInputElement, hex?: HTMLInputElement }>} */
  const controls = new Map();

  for (const def of ROWS) {
    const row = document.createElement('div');
    row.className = 'sl-row';
    row.dataset.key = def.key;

    const head = document.createElement('div');
    head.className = 'sl-row-head';

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'sl-enable';
    toggle.checked = rowOn.get(def.key) !== false;
    toggle.title = 'Ligar / desligar';
    toggle.setAttribute('aria-label', `Ativar ${def.label}`);

    const label = document.createElement('label');
    label.className = 'sl-label';
    label.textContent = def.label;

    head.appendChild(toggle);
    head.appendChild(label);
    row.appendChild(head);

    /** @type {{ row: HTMLElement, toggle: HTMLInputElement, range?: HTMLInputElement, num?: HTMLInputElement, color?: HTMLInputElement, hex?: HTMLInputElement }} */
    const ctl = { row, toggle };

    if (def.kind === 'color') {
      const tools = document.createElement('div');
      tools.className = 'sl-tools';
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'sl-color';
      color.setAttribute('aria-label', 'Cor');
      const hex = document.createElement('input');
      hex.type = 'text';
      hex.className = 'sl-hex';
      hex.spellcheck = false;
      hex.maxLength = 7;
      hex.setAttribute('aria-label', 'Cor hex');
      tools.appendChild(color);
      tools.appendChild(hex);
      row.appendChild(tools);
      ctl.color = color;
      ctl.hex = hex;
    } else {
      const tools = document.createElement('div');
      tools.className = 'sl-tools';
      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'sl-range';
      range.min = String(def.min);
      range.max = String(def.max);
      range.step = String(def.step);
      range.setAttribute('aria-label', def.label);
      const num = document.createElement('input');
      num.type = 'number';
      num.className = 'sl-num';
      num.step = String(def.step);
      // No min/max on number — typed finite values are applied as-is (slider thumb may clamp).
      num.setAttribute('aria-label', `${def.label} valor`);
      tools.appendChild(range);
      tools.appendChild(num);
      row.appendChild(tools);
      ctl.range = range;
      ctl.num = num;
    }

    rowsEl.appendChild(row);
    controls.set(def.key, ctl);
  }

  function rowOnObject() {
    /** @type {Record<string, boolean>} */
    const o = {};
    for (const def of ROWS) o[def.key] = rowOn.get(def.key) !== false;
    return o;
  }

  function persistHudState() {
    saveStoredStreetLights({
      params: streetLights.getParams(),
      rowOn: rowOnObject()
    });
  }

  function readUiValue(def, ctl) {
    if (def.kind === 'color') {
      return numFromHex(ctl.hex?.value) ?? numFromHex(ctl.color?.value) ?? DEFAULT_PARAMS.color;
    }
    const raw = ctl.num?.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number(DEFAULT_PARAMS[def.key]);
  }

  function paintFromParams(p) {
    for (const def of ROWS) {
      const ctl = controls.get(def.key);
      if (!ctl) continue;
      const on = rowOn.get(def.key) !== false;
      ctl.toggle.checked = on;
      ctl.row.classList.toggle('is-off', !on);

      let display = on
        ? p[def.key]
        : remembered.has(def.key)
          ? remembered.get(def.key)
          : p[def.key];

      if (def.enableFlag && p[def.enableFlag] === false && !remembered.has(def.key)) {
        display = p[def.key];
      }

      if (def.kind === 'color') {
        const hex = hexFromNum(display);
        if (ctl.color && document.activeElement !== ctl.color) ctl.color.value = hex;
        if (ctl.hex && document.activeElement !== ctl.hex) ctl.hex.value = hex;
        if (ctl.color) ctl.color.disabled = !on;
        if (ctl.hex) ctl.hex.disabled = !on;
      } else {
        const step = def.step ?? 0.1;
        const s = formatNum(Number(display), step);
        if (ctl.range && document.activeElement !== ctl.range) {
          const lo = def.min ?? 0;
          const hi = def.max ?? 1;
          const clamped = Math.max(lo, Math.min(hi, Number(display)));
          ctl.range.value = String(clamped);
        }
        if (ctl.num && document.activeElement !== ctl.num) ctl.num.value = s;
        if (ctl.range) ctl.range.disabled = !on;
        if (ctl.num) ctl.num.disabled = !on;
      }
    }
  }

  function applyPatch(patch) {
    streetLights.setParams(patch);
    persistHudState();
    paintFromParams(streetLights.getParams());
  }

  function applyRowValue(def, value) {
    if (rowOn.get(def.key) === false) {
      remembered.set(def.key, value);
      persistHudState();
      paintFromParams(streetLights.getParams());
      return;
    }
    if (def.kind === 'color') {
      applyPatch({ color: value });
      return;
    }
    // Typed / finite value wins — do not clamp to slider max before setParams.
    applyPatch({ [def.key]: value });
  }

  function setRowEnabled(def, on) {
    const was = rowOn.get(def.key) !== false;
    if (was === on) return;
    rowOn.set(def.key, on);
    const ctl = controls.get(def.key);
    const currentUi = ctl ? readUiValue(def, ctl) : streetLights.getParams()[def.key];

    if (def.enableFlag) {
      if (!on) {
        remembered.set(def.key, currentUi);
        applyPatch({ [def.enableFlag]: false });
      } else {
        const restore = remembered.has(def.key) ? remembered.get(def.key) : currentUi;
        remembered.delete(def.key);
        applyPatch({ [def.enableFlag]: true, [def.key]: restore });
      }
      return;
    }

    if (def.key === 'color') {
      if (!on) {
        remembered.set(def.key, currentUi);
        applyPatch({ color: 0x000000 });
      } else {
        const restore = remembered.has(def.key) ? remembered.get(def.key) : currentUi;
        remembered.delete(def.key);
        applyPatch({ color: restore });
      }
      return;
    }

    // Structural / other: lock editing; keep last applied value (no silent default swap).
    if (!on) {
      remembered.set(def.key, currentUi);
      persistHudState();
      paintFromParams(streetLights.getParams());
    } else {
      remembered.delete(def.key);
      persistHudState();
      paintFromParams(streetLights.getParams());
    }
  }

  for (const def of ROWS) {
    const ctl = controls.get(def.key);
    if (!ctl) continue;

    ctl.toggle.addEventListener('change', () => {
      setRowEnabled(def, ctl.toggle.checked);
    });

    if (def.kind === 'color') {
      const syncColor = (hexStr) => {
        const n = numFromHex(hexStr);
        if (n == null) return;
        if (ctl.color) ctl.color.value = hexFromNum(n);
        if (ctl.hex) ctl.hex.value = hexFromNum(n);
        applyRowValue(def, n);
      };
      ctl.color?.addEventListener('input', () => syncColor(ctl.color.value));
      ctl.hex?.addEventListener('change', () => syncColor(ctl.hex.value));
      ctl.hex?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          syncColor(ctl.hex.value);
        }
      });
    } else {
      const push = (raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        // Slider thumb only: clamp display range; applied value stays raw `n`.
        if (ctl.range) {
          const lo = def.min ?? 0;
          const hi = def.max ?? 1;
          ctl.range.value = String(Math.max(lo, Math.min(hi, n)));
        }
        if (ctl.num) ctl.num.value = formatNum(n, def.step ?? 0.1);
        applyRowValue(def, n);
      };
      ctl.range?.addEventListener('input', () => push(ctl.range.value));
      ctl.num?.addEventListener('change', () => push(ctl.num.value));
      ctl.num?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          push(ctl.num.value);
        }
      });
    }
  }

  resetBtn?.addEventListener('click', () => {
    remembered.clear();
    for (const def of ROWS) rowOn.set(def.key, true);
    clearStoredStreetLights();
    applyPatch({
      ...DEFAULT_PARAMS,
      enabledSpot: true,
      enabledPoint: true,
      enabledEmissive: true
    });
  });

  persistHudState();
  paintFromParams(streetLights.getParams());

  // Expose key for diagnostics (matches STORAGE_KEY export).
  root.dataset.storageKey = STORAGE_KEY;
}
