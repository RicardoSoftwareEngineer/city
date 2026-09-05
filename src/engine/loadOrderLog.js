/**
 * Live load-order phases for the left HUD (spawn streets + terrain mesh may overlap).
 *
 * mode:
 *   sync  — hard dependency before play is safe (phys Heightfield under the car)
 *   async — streamed under MemoryGuardian pressure (visuals; FPS-first)
 *
 * With phys pinned under the car, virtually nothing else is mandatory. Spawn
 * streets are preferred early asphalt visuals, not a hard sync gate.
 */

const phases = [
  {
    id: 'ground',
    mode: 'sync',
    label: 'Chão phys (sob o carro)',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'spawn',
    mode: 'async',
    label: 'Ruas do spawn',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'terrain',
    mode: 'async',
    label: 'Terreno (mesh, fundo)',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'streets',
    mode: 'async',
    label: 'Ruas / asfalto',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'furniture',
    mode: 'async',
    label: 'Mobília / postes',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'bank',
    mode: 'async',
    label: 'Banco',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'buildings',
    mode: 'async',
    label: 'Prédios',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'nature',
    mode: 'async',
    label: 'Flores / grama / árvores / água',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  },
  {
    id: 'carpet',
    mode: 'async',
    label: 'Carpet denso (fundo)',
    status: 'pending',
    ms: 0,
    detail: '',
    t0: 0
  }
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

function snapshotPhase(p) {
  return {
    id: p.id,
    mode: p.mode,
    label: p.label,
    status: p.status,
    ms: Math.round(p.ms + (p.t0 ? performance.now() - p.t0 : 0)),
    detail: p.detail
  };
}

export function getLoadOrderRevision() {
  return revision;
}

export function getLoadOrderSnapshot() {
  const all = phases.map(snapshotPhase);
  return {
    activeId,
    phases: all,
    sync: all.filter((p) => p.mode === 'sync'),
    async: all.filter((p) => p.mode === 'async')
  };
}

export function phaseIdForPriority(priority) {
  return PRIO_TO_PHASE[priority] || null;
}

/**
 * Note sync ground work under the car. Does not steal the async active phase.
 * `elapsedMs` must be real wall time spent building (not a fake per-tile attribution).
 * After endGroundPhysPhase(), further builds are silent so the HUD stays honest.
 */
export function noteGroundPhys(built, detail = '', elapsedMs = 0) {
  if (!built) return;
  const p = row('ground');
  if (!p) return;
  if (p.status === 'done') return;
  if (p.status === 'pending') p.status = 'running';
  if (elapsedMs > 0) p.ms += elapsedMs;
  if (detail) p.detail = detail;
  bump();
}

export function endGroundPhysPhase() {
  const p = row('ground');
  if (!p) return;
  if (p.status === 'pending') return;
  stopClock(p);
  p.status = 'done';
  bump();
}

export function beginLoadPhase(id, detail = '') {
  const p = row(id);
  if (!p) return;
  // Concurrent async phases (terrain mesh + spawn streets) may run together.
  // Do not force-complete another running phase when this one starts.
  if (p.status !== 'running') {
    p.status = 'running';
    p.t0 = performance.now();
  }
  if (detail) p.detail = detail;
  activeId = id;
  bump();
}

export function tickLoadPhase(id, detail) {
  const p = row(id);
  if (!p) return;
  if (p.status !== 'running') beginLoadPhase(id, detail);
  else if (detail && detail !== p.detail) {
    p.detail = detail;
    activeId = id;
    bump();
  } else {
    activeId = id;
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

export function finishAllLoadPhases(except = []) {
  const skip = new Set(except);
  for (const p of phases) {
    if (skip.has(p.id)) continue;
    if (p.status === 'running') endLoadPhase(p.id);
    else if (p.id === 'ground' && p.status !== 'pending') endGroundPhysPhase();
  }
  activeId = null;
  bump();
}
