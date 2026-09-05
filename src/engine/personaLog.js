/**
 * Ring-buffer decision log + overload % per persona (HUD).
 */

const MAX = 10;

/** @type {Map<string, { decisions: string[], overload: number }>} */
const personas = new Map();

function ensure(persona) {
  let row = personas.get(persona);
  if (!row) {
    row = { decisions: [], overload: 0 };
    personas.set(persona, row);
  }
  return row;
}

export function noteDecision(persona, text) {
  if (!persona || text == null || text === '') return;
  const row = ensure(persona);
  row.decisions.unshift(String(text));
  if (row.decisions.length > MAX) row.decisions.length = MAX;
}

export function getPersonaSnapshot(persona) {
  const row = ensure(persona);
  return {
    decisions: row.decisions.slice(),
    overload: row.overload
  };
}

export function setOverload(persona, pct) {
  const row = ensure(persona);
  const n = Number(pct);
  row.overload = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

export const PERSONA_IDS = [
  'Guardian',
  'Carregador',
  'Valve',
  'Renderer',
  'LoadGovernor',
  'QualityAdapter'
];
