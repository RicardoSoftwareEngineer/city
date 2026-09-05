/**
 * Load/hitch profiler.
 *
 * Each hitch names: MAP vs LOAD (which .md), phase, last real work (not draw),
 * draw calls / triangles / GL programs (+delta). That split is what decides
 * OPTIMIZATION_MAP_ITEMS.md vs OPTIMIZATION_LOADING.md.
 */

const cpuEntries = [];
const hitchEntries = [];
const recentWork = [];
let lastOp = { name: 'none', kind: 'none', at: 0 };
let lastWork = { name: 'none', kind: 'none', at: 0 };
let lastDraw = {
  ms: 0,
  tag: 'frame',
  calls: 0,
  tris: 0,
  programs: 0,
  programDelta: 0,
  shadows: false,
  baking: false
};
let prevPrograms = 0;
let phase = 'boot';
/** Once true, every felt hitch is listed under Travamentos — FPS. */
let interactive = false;
let streamLabel = '';
let hitchRevision = 0;
let govSnap = { carga: 50, batch: 16, streaming: false, holding: false, quality: 'full' };
const sessionStats = {
  gateMs: 0,
  gateEnters: 0,
  compileCount: 0,
  compileMs: 0,
  hitchCount: 0,
  worstFrameMs: 0,
  worstFrameAt: 0,
  worstCause: ''
};

const TAB_AWAY_MS = 45000;
const RECENT_CAP = 8;

function shortName(label) {
  if (!label) return '?';
  const slash = Math.max(label.lastIndexOf('/'), label.lastIndexOf('\\'));
  return slash >= 0 ? label.slice(slash + 1) : label;
}

function pushRecent(name) {
  recentWork.push(name);
  if (recentWork.length > RECENT_CAP) recentWork.shift();
}

export function setGovernorSnap(snap) {
  govSnap = snap;
}

export function setLoadPhase(next) {
  phase = next;
}

export function getLoadPhase() {
  return phase;
}

/** Mark the session as playable — FPS hitch list starts capturing everything. */
export function setInteractive(on = true) {
  interactive = Boolean(on);
  if (interactive && phase !== 'play' && !String(phase).startsWith('shadow')) {
    phase = 'play';
  }
}

export function getInteractive() {
  return interactive;
}

/**
 * Stream ring label for the HUD. Does not steal hitch bucketing once interactive:
 * WorldStream used to call setLoadPhase("stream rN") forever, which hid FPS freezes.
 */
export function setStreamLabel(label) {
  streamLabel = label || '';
  if (!interactive) phase = streamLabel || phase;
}

export function getStreamLabel() {
  return streamLabel;
}

export function classifyMd(text) {
  const s = String(text).toLowerCase();
  if (/gltf:parse|gltf:clone|instancer|merge|bank/.test(s)) return 'MAP';
  return 'LOAD';
}

export function beginLoad(kind, label) {
  const name = `${kind} ${shortName(label)}`;
  lastOp = { name, kind, at: performance.now() };
  if (kind !== 'draw') {
    lastWork = lastOp;
    pushRecent(name);
  }
}

export function loadMark(kind, label, ms) {
  const name = shortName(label);
  const row = { kind, name, ms: Math.round(ms * 10) / 10, phase };
  cpuEntries.push(row);
  lastOp = { name: `${kind} ${name}`, kind, at: performance.now() };
  if (kind !== 'draw') {
    lastWork = lastOp;
    pushRecent(lastOp.name);
  }
  if (kind === 'gpu' && String(label).includes('compile')) {
    sessionStats.compileCount += 1;
    sessionStats.compileMs += ms;
  }
  if (kind === 'fps-gate') {
    sessionStats.gateMs += ms;
    sessionStats.gateEnters += 1;
  }

  const line = `[cpu] ${row.ms.toFixed(1).padStart(7)}ms  ${kind.padEnd(14)} ${name}  [${phase}]`;
  if (ms >= 16) console.warn(line);
  else if (ms >= 4) console.log(line);
}

export function snapshotDraw(stats) {
  const programDelta = stats.programs - prevPrograms;
  prevPrograms = stats.programs;
  lastDraw = { ...stats, programDelta };
}

export function getLastLoadOp() {
  return lastOp;
}

export function lastOpHasTag() {
  return lastOp.name !== 'none';
}

export function noteHitch(frameMs) {
  if (frameMs >= TAB_AWAY_MS) return;

  const now = performance.now();
  const workAgo = now - lastWork.at;
  const opAgo = now - lastOp.at;

  let cause;
  let hint;
  if (lastWork.name !== 'none' && workAgo < 2500 && lastOp.kind === 'draw') {
    cause = `after: ${lastWork.name}`;
    hint = 'slow draw after that work (GPU compile / first upload)';
  } else if (lastOp.name === 'none') {
    cause = '(no tag)';
    hint = 'nothing tagged yet';
  } else if (opAgo < 40) {
    cause = lastOp.name;
    hint = 'CPU still in tagged work';
  } else if (opAgo < 2500) {
    cause = `after: ${lastOp.name}`;
    hint = 'likely GPU compile / shadow / first draw';
  } else {
    cause = '(tag expired)';
    hint = 'last work >2.5s ago';
  }

  if (lastDraw.programDelta > 0) {
    hint += ` · +${lastDraw.programDelta} GL programs`;
  }
  if (lastDraw.baking) hint += ' · shadow-bake';

  const md = classifyMd(`${cause} ${lastWork.name}`);
  const row = {
    frameMs: Math.round(frameMs),
    fps: Math.round(1000 / Math.max(frameMs, 1)),
    cause,
    work: lastWork.name,
    md,
    phase,
    stream: streamLabel || '',
    agoMs: Math.round(Math.min(workAgo, opAgo)),
    calls: lastDraw.calls,
    tris: lastDraw.tris,
    programs: lastDraw.programs,
    programDelta: lastDraw.programDelta,
    drawMs: Math.round(lastDraw.ms),
    shadows: lastDraw.shadows,
    baking: lastDraw.baking,
    carga: govSnap.carga,
    batch: govSnap.batch,
    streaming: Boolean(govSnap.streaming),
    interactive,
    holding: Boolean(govSnap.holding),
    quality: govSnap.quality || 'full',
    recent: recentWork.slice(-4).join(' ← ')
  };
  hitchEntries.push(row);
  hitchRevision++;
  sessionStats.hitchCount += 1;
  if (row.frameMs > sessionStats.worstFrameMs) {
    sessionStats.worstFrameMs = row.frameMs;
    sessionStats.worstFrameAt = performance.now();
    sessionStats.worstCause = row.cause;
  }

  console.warn(
    `[hitch] ${row.frameMs.toString().padStart(5)}ms ${row.fps.toString().padStart(3)}fps  ${md.padEnd(4)} ${String(phase).padEnd(14)}  ` +
    `stream:${row.stream || '-'}  work:${row.work}  cause:${row.cause}  ` +
    `draw:${row.drawMs}ms ago:${row.agoMs}ms ${row.calls}calls ${(row.tris / 1000).toFixed(0)}ktri ${row.programs}prog` +
    `${row.programDelta ? ` +${row.programDelta}prog` : ''}  ` +
    `shd:${row.shadows ? (row.baking ? 'bake' : 'on') : 'off'}  carga:${row.carga} batch:${row.batch} ` +
    `hold:${row.holding ? 1 : 0} q:${row.quality} streaming:${row.streaming ? 1 : 0}  | ${hint}` +
    (row.recent ? `  recent:${row.recent}` : '')
  );
}

export function getHitchRevision() {
  return hitchRevision;
}

export function getSessionStats() {
  return { ...sessionStats };
}

export function noteGateWait(ms) {
  if (ms > 0) {
    sessionStats.gateMs += ms;
    sessionStats.gateEnters += 1;
  }
}

function isFreshStreamWork(e) {
  const cause = String(e.cause || '');
  const work = String(e.work || '');
  return (
    e.streaming &&
    work &&
    work !== 'none' &&
    (e.agoMs == null || e.agoMs < 2500) &&
    !cause.includes('tag expired') &&
    !cause.includes('no tag')
  );
}

export function getTopHitches(limit = 8, kind = 'all') {
  let rows = hitchEntries;
  if (kind === 'load') {
    // Boot / pre-interactive, or stream work still attributed to a load tag.
    rows = hitchEntries.filter((e) => !e.interactive || isFreshStreamWork(e));
  } else if (kind === 'play') {
    // Once the world is interactive, EVERY felt hitch appears here — even if
    // hinterland streaming is still running (that used to hide 1s+ freezes).
    rows = hitchEntries.filter((e) => e.interactive);
  }
  return rows
    .slice()
    .sort((a, b) => b.frameMs - a.frameMs)
    .slice(0, limit);
}

/** Loading hitches (boot / stream work). */
export function getTopLoadHitches(limit = 8) {
  return getTopHitches(limit, 'load');
}

/** FPS hitches after the session became interactive. */
export function getTopPlayHitches(limit = 8) {
  return getTopHitches(limit, 'play');
}

export async function measureLoad(kind, label, fn) {
  const t0 = performance.now();
  const result = await fn();
  loadMark(kind, label, performance.now() - t0);
  return result;
}

export function measureLoadSync(kind, label, fn) {
  beginLoad(kind, label);
  const t0 = performance.now();
  const result = fn();
  loadMark(kind, label, performance.now() - t0);
  return result;
}

function topRows(list, keyFn, msFn, limit) {
  const by = new Map();
  for (const e of list) {
    const key = keyFn(e);
    const cur = by.get(key) || { name: key, count: 0, total: 0, max: 0 };
    const ms = msFn(e);
    cur.count++;
    cur.total += ms;
    if (ms > cur.max) cur.max = ms;
    by.set(key, cur);
  }
  return [...by.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((r) => ({
      what: r.name,
      hits: r.count,
      maxMs: Math.round(r.max),
      sumMs: Math.round(r.total)
    }));
}

export function dumpLoadLog() {
  const byMd = topRows(hitchEntries, (e) => e.md, (e) => e.frameMs, 5);
  const hitches = topRows(hitchEntries, (e) => `${e.md} ${e.phase} ${e.cause}`, (e) => e.frameMs, 20);
  const cpu = topRows(cpuEntries, (e) => `${e.kind} ${e.name}`, (e) => e.ms, 20);

  console.log('[opt] which .md — MAP = OPTIMIZATION_MAP_ITEMS.md  LOAD = OPTIMIZATION_LOADING.md');
  for (const r of byMd) {
    console.log(`  ${r.what.padEnd(4)}  sum ${String(r.sumMs).padStart(6)}ms  ${r.hits}x  max ${r.maxMs}ms`);
  }

  console.log('[opt] hitch causes');
  for (const r of hitches) {
    console.log(`  hitch  sum ${String(r.sumMs).padStart(5)}ms  ${String(r.hits).padStart(3)}x  max ${String(r.maxMs).padStart(4)}ms  ${r.what}`);
  }
  if (hitches.length === 0) console.log('  (no dropped frames tagged)');

  console.log('[opt] CPU tagged work');
  for (const r of cpu) {
    console.log(`  cpu    sum ${String(r.sumMs).padStart(5)}ms  ${String(r.hits).padStart(3)}x  max ${String(r.maxMs).padStart(4)}ms  ${r.what}`);
  }
  console.log('[opt] recent work', recentWork.join(' ← '));
  console.log(
    `[opt] session gate ${Math.round(sessionStats.gateMs)}ms ×${sessionStats.gateEnters}` +
    `  compile ${sessionStats.compileCount} / ${Math.round(sessionStats.compileMs)}ms` +
    `  hitches ${sessionStats.hitchCount}  worst ${sessionStats.worstFrameMs}ms (${sessionStats.worstCause})`
  );
  console.log('[opt] hitch threshold: frame > 1/(TARGET_FPS-2) ≈ under 58fps; see Travamentos — FPS');
}

if (typeof window !== 'undefined') {
  window.dumpLoadLog = dumpLoadLog;
}
