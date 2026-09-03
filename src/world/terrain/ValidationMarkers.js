/**
 * Temporary numbered markers for Ricardo's Passo 8–15 playtest checklist.
 * Floating sprites + a small HTML legend. Remove after validation.
 */

import * as THREE from 'three';
import { cityBounds } from '../RoadDimensions.js';
import { surfaceY } from './paths.js';
import { pathEnds } from './paths.js';
import { slopeAt } from './heightField.js';

const LEGEND_ID = 'terrain-validate-legend';

/** Checklist items (same numbers as in chat). */
export const VALIDATE_ITEMS = [
  {
    n: 1,
    title: 'Trilhas N/S/L/O + atalho SW',
    hint: 'Dirija nas 4 saídas de terra (~4 m) e no atalho sudoeste'
  },
  {
    n: 2,
    title: 'Terreno nivelado + rocha',
    hint: 'Fora da cidade: morros; cidade plana; tint de rocha em encosta íngreme'
  },
  {
    n: 3,
    title: 'Leito de terra + grama + vento',
    hint: 'Caminho de terra; grama Wide/Wheat densa; vento com rajada lenta'
  },
  {
    n: 4,
    title: 'Flores no ombro',
    hint: 'Flower_1/2/7 + trevo mais densos na beira da trilha'
  },
  {
    n: 5,
    title: 'Árvores LOD + bosquezinho',
    hint: 'Detalhe perto / simples longe; mini-bosque no fim da trilha'
  },
  {
    n: 6,
    title: 'Horizonte + pinheiros longe',
    hint: 'Sem névoa; GiantPines distantes sem sombra; horizonte aberto'
  },
  {
    n: 7,
    title: 'Logs de hitch',
    hint: 'Console/HUD: path network, terrain, veg, treeLod — sem padrão novo >2 s'
  },
  {
    n: 8,
    title: 'Cidade 4×4 intacta',
    hint: 'Asfalto, prédios e grid como antes; só o campo ao redor mudou'
  }
];

function makeSprite(n) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 54, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fbbf24';
  ctx.stroke();
  ctx.fillStyle = '#fef3c7';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    depthWrite: false,
    transparent: true
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(8, 8, 1);
  spr.renderOrder = 1000;
  spr.name = `validateMarker_${n}`;
  return spr;
}

function pickSteepSample(baseX, baseZ) {
  let best = { x: baseX, z: baseZ, s: 0 };
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 25 + (i % 5) * 8;
    const x = baseX + Math.cos(a) * r;
    const z = baseZ + Math.sin(a) * r;
    const s = slopeAt(x, z);
    if (s > best.s) best = { x, z, s };
  }
  return best;
}

function markerWorldPos(n) {
  const b = cityBounds();
  const midX = 90;
  const midZ = 90;
  const ends = pathEnds();
  const southEnd = ends[0] || { x: midX, z: b.minZ - 120 };
  const westEnd = ends[1] || { x: b.minX - 100, z: midZ };

  switch (n) {
    case 1:
      // Mid south dirt exit — example of the path network
      return { x: midX, z: b.minZ - 35 };
    case 2: {
      const steep = pickSteepSample(midX + 50, b.minZ - 90);
      return { x: steep.x, z: steep.z };
    }
    case 3:
      // Just off the south path bed — grass + wind
      return { x: midX + 8, z: b.minZ - 55 };
    case 4:
      // Path shoulder flowers
      return { x: midX + 3.5, z: b.minZ - 40 };
    case 5:
      // Grove at south path tip
      return { x: southEnd.x, z: southEnd.z };
    case 6:
      // Farther south for fog / distant pines
      return { x: midX - 20, z: b.minZ - 160 };
    case 7:
      // Near spawn — look at HUD Travamentos / console
      return { x: 6, z: 18 };
    case 8:
      // City interior
      return { x: midX, z: midZ };
    default:
      return { x: midX, z: midZ };
  }
}

function ensureLegend() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEGEND_ID)) return;
  const el = document.createElement('div');
  el.id = LEGEND_ID;
  el.style.cssText = [
    'position:fixed',
    'left:10px',
    'bottom:10px',
    'z-index:40',
    'max-width:320px',
    'max-height:42vh',
    'overflow:auto',
    'padding:10px 12px',
    'border-radius:10px',
    'background:rgba(15,23,42,0.82)',
    'color:#f8fafc',
    'font:12px/1.35 system-ui,sans-serif',
    'pointer-events:none',
    'box-shadow:0 8px 24px rgba(0,0,0,0.35)'
  ].join(';');
  el.innerHTML =
    '<div style="font-weight:700;margin-bottom:6px;color:#fbbf24">Checklist terreno (números no mapa)</div>' +
    VALIDATE_ITEMS.map(
      (it) =>
        `<div style="margin:4px 0"><span style="display:inline-block;min-width:1.4em;font-weight:700;color:#fde68a">${it.n}.</span> ${it.title}</div>`
    ).join('');
  document.body.appendChild(el);
}

/**
 * Add floating numbered sprites + HTML legend for playtest.
 * Instant (not streamed) so markers exist as soon as the scene boots.
 */
export function addValidationMarkers(parentGroup) {
  const root = new THREE.Group();
  root.name = 'validationMarkers';
  for (const item of VALIDATE_ITEMS) {
    const { x, z } = markerWorldPos(item.n);
    const y = surfaceY(x, z) + 6;
    const spr = makeSprite(item.n);
    spr.position.set(x, y, z);
    spr.userData.validate = item;
    root.add(spr);
  }
  parentGroup.add(root);
  ensureLegend();
  return root;
}
