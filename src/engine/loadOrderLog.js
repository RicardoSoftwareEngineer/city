/**
 * Live load-order phases for the left HUD (terrain-first pipeline).
 */

const phases = [
  { id: 'spawn', label: '1 · Ruas do spawn', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'terrain', label: '2 · Terreno (mesh)', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'streets', label: '3 · Ruas / asfalto', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'furniture', label: '4 · Mobília / postes', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'bank', label: '5 · Banco', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'buildings', label: '6 · Prédios', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'nature', label: '7 · Flores / grama / árvores / água', status: 'pending', ms: 0, detail: '', t0: 0 },
  { id: 'carpet', label: '8 · Carpet denso', status: 'pending', ms: 0, detail: '', t0: 0 }
];

let revision = 0;
let activeId = null;

const PRIO_TO_PHASE = {
  0: 'streets',
  1: 'furniture',
  2: 'bank',
  3: 'buildings',
  4: 'nature',
  5: 'carpet'
};

function bump() {
  revision += 1;
}

function row(id) {
  return phases.find((p) => p.id === id);
}

function stopClock(p) {
  if (p && p.t0) {
    p.ms += performance.now() - p.t0;
    p.t0 = 0;
  }
}

export function getLoadOrderRevision() {
  return revision;
}

export function getLoadOrderSnapshot() {
  return {
    activeId,
    phases: phases.map((p) => ({
      id: p.id,
      label: p.label,
      status: p.status,
      ms: Math.round(p.ms + (p.t0 ? performance.now() - p.t0 : 0)),
      detail: p.detail
    }))
  };
}

export function phaseIdForPriority(priority) {
  return PRIO_TO_PHASE[priority] || null;
}

/** Switch active phase (pauses previous clock, keeps it running until ended). */
export function beginLoadPhase(id, detail = '') {
  if (activeId && activeId !== id) {
    const prev = row(activeId);
    if (prev) {
      stopClock(prev);
      prev.status = 'done';
    }
  }
  const p = row(id);
  if (!p) return;
  p.status = 'running';
  p.t0 = performance.now();
  if (detail) p.detail = detail;
  activeId = id;
  bump();
}

export function tickLoadPhase(id, detail) {
  const p = row(id);
  if (!p) return;
  if (activeId !== id || p.status !== 'running') beginLoadPhase(id, detail);
  else if (detail && detail !== p.detail) {
    p.detail = detail;
    bump();
  }
}

export function endLoadPhase(id) {
  const p = row(id);
  if (!p) return;
  stopClock(p);
  p.status = 'done';
  if (activeId === id) activeId = null;
  bump();
}

export function finishAllLoadPhases() {
  for (const p of phases) {
    if (p.status === 'running') endLoadPhase(p.id);
  }
  activeId = null;
  bump();
}
