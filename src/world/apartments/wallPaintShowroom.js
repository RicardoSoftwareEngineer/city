/**
 * Wall paint / texture showroom — browseable grid of Poly Haven CC0 1k diffuse
 * panels for picking official apartment wall paints.
 *
 * Staging only (does not change roomTemplate bake or the 5 apt candidates).
 * Debug: window.__cityWallShowroom
 */

import * as THREE from 'three';
import { LIVING_WALL_IDS, LIVING_WALL_LABELS } from './aptLayouts.js';

/** Showroom origin: grass south of apt candidates (~238,−10), clear aisle. */
export const SHOWROOM_ORIGIN = { x: 238, y: 0.02, z: -42 };

/** Vertical panel size (metres). */
export const PANEL = { width: 2.5, height: 2.5 };

/** Centre-to-centre spacing along a row (+X). */
export const PANEL_SPACING_X = 3.15;

/** Gap between category section starts along −Z (south). */
export const SECTION_GAP_Z = 5.2;

/** Max panels per row before wrapping within a section. */
export const COLS = 8;

/**
 * Categories with Portuguese section headers.
 * `concrete_wall_001/003/004` stay with Tintas/Gesso (curated list); modern
 * finishes live under Concreto.
 */
export const CATEGORIES = [
  {
    id: 'tintas-gesso',
    header: 'Tintas / Gesso',
    stroke: '#fbbf24',
    items: [
      { id: 'painted_plaster_wall', pt: 'Gesso pintado' },
      { id: 'patterned_plaster_wall', pt: 'Gesso padrão' },
      { id: 'plastered_wall', pt: 'Parede rebocada' },
      { id: 'white_plaster_02', pt: 'Gesso branco' },
      { id: 'white_stucco', pt: 'Estuque branco' },
      { id: 'beige_wall_001', pt: 'Parede bege 1' },
      { id: 'beige_wall_002', pt: 'Parede bege 2' },
      { id: 'blue_plaster_wall', pt: 'Gesso azul' },
      { id: 'blue_plaster_weathered', pt: 'Gesso azul gasto' },
      { id: 'grey_plaster', pt: 'Gesso cinza' },
      { id: 'grey_plaster_02', pt: 'Gesso cinza 2' },
      { id: 'grey_plaster_03', pt: 'Gesso cinza 3' },
      { id: 'plaster_grey_04', pt: 'Gesso cinza 4' },
      { id: 'damaged_plaster', pt: 'Gesso danificado' },
      { id: 'patterned_clay_plaster', pt: 'Argila padrão' },
      { id: 'patterned_clay_wall', pt: 'Parede de argila' },
      { id: 'plastered_wall_02', pt: 'Reboco 2' },
      { id: 'plastered_wall_03', pt: 'Reboco 3' },
      { id: 'plastered_wall_04', pt: 'Reboco 4' },
      { id: 'plastered_wall_05', pt: 'Reboco 5' },
      { id: 'red_plaster_weathered', pt: 'Gesso vermelho gasto' },
      { id: 'peeling_painted_wall', pt: 'Tinta descascando' },
      { id: 'ceiling_interior', pt: 'Teto interior' },
      { id: 'clay_plaster', pt: 'Gesso de argila' },
      { id: 'concrete_wall_001', pt: 'Concreto parede 1' },
      { id: 'concrete_wall_003', pt: 'Concreto parede 3' },
      { id: 'concrete_wall_004', pt: 'Concreto parede 4' }
    ]
  },
  {
    id: 'madeira-paineis',
    header: 'Madeira / Painéis',
    stroke: '#a78bfa',
    items: [
      { id: 'decrepit_wallpaper', pt: 'Papel de parede velho' },
      { id: 'dark_paneled_wood', pt: 'Painel madeira escura' },
      { id: 'black_painted_planks', pt: 'Tábuas pretas' },
      { id: 'blue_painted_planks', pt: 'Tábuas azuis' },
      { id: 'distressed_painted_planks', pt: 'Tábuas gastas' },
      { id: 'brown_planks_05', pt: 'Tábuas marrons' },
      { id: 'hinoki_planks', pt: 'Tábuas hinoki' },
      { id: 'japanese_cedar_planks', pt: 'Cedro japonês' },
      { id: 'raw_plank_wall', pt: 'Tábuas cruas' },
      { id: 'oriented_strand_board', pt: 'OSB / aglomerado' }
    ]
  },
  {
    id: 'tijolo',
    header: 'Tijolo',
    stroke: '#f87171',
    items: [
      { id: 'painted_brick', pt: 'Tijolo pintado' },
      { id: 'painted_worn_brick', pt: 'Tijolo pintado gasto' },
      { id: 'brick_wall_001', pt: 'Tijolo 001' },
      { id: 'brick_wall_08', pt: 'Tijolo 08' },
      { id: 'wall_bricks_plaster', pt: 'Tijolo + reboco' },
      { id: 'plaster_brick_01', pt: 'Reboco tijolo 01' },
      { id: 'plaster_brick_pattern', pt: 'Padrão tijolo/reboco' },
      { id: 'red_brick_plaster_patch_02', pt: 'Tijolo vermelho + patch' },
      { id: 'patterned_brick_wall', pt: 'Tijolo padrão' },
      { id: 'large_red_bricks', pt: 'Tijolos vermelhos grandes' }
    ]
  },
  {
    id: 'concreto',
    header: 'Concreto',
    stroke: '#94a3b8',
    items: [
      { id: 'concrete_wall_005', pt: 'Concreto 005' },
      { id: 'patterned_concrete_wall', pt: 'Concreto padrão' },
      { id: 'ribbed_concrete_wall', pt: 'Concreto nervurado' },
      { id: 'concrete_tile_facade', pt: 'Fachada concreto' },
      { id: 'concrete_slab_wall', pt: 'Laje de concreto' },
      { id: 'herringbone_concrete_tile', pt: 'Concreto espinha' },
      { id: 'precast_concrete_wall', pt: 'Concreto pré-moldado' }
    ]
  },
  {
    id: 'outros',
    header: 'Outros',
    stroke: '#34d399',
    items: [
      { id: 'bamboo_wall', pt: 'Parede de bambu' },
      { id: 'clay_block_wall', pt: 'Bloco de argila' },
      { id: 'exterior_wall_cladding', pt: 'Revestimento exterior' },
      { id: 'rectangular_facade_tiles', pt: 'Azulejos fachada' }
    ]
  },
  {
    id: 'sala-living',
    header: 'Sala / Living (TV)',
    stroke: '#f472b6',
    items: LIVING_WALL_IDS.map((id) => ({
      id,
      pt: LIVING_WALL_LABELS[id] || id
    }))
  }
];

function textureUrl(id) {
  return `/textures/walls/${id}/${id}_diff_1k.jpg`;
}

function loadAlbedo(id) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      textureUrl(id),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 2;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        resolve(tex);
      },
      undefined,
      () => {
        console.warn('[wall-showroom] albedo missing', id);
        resolve(null);
      }
    );
  });
}

function makeLabelSprite(lines, opts = {}) {
  const w = opts.w || 640;
  const h = opts.h || 110;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.bg || 'rgba(15, 23, 42, 0.9)';
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.lineTo(w - r, 4);
  ctx.quadraticCurveTo(w - 4, 4, w - 4, r);
  ctx.lineTo(w - 4, h - r);
  ctx.quadraticCurveTo(w - 4, h - 4, w - r, h - 4);
  ctx.lineTo(r, h - 4);
  ctx.quadraticCurveTo(4, h - 4, 4, h - r);
  ctx.lineTo(4, r);
  ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = opts.stroke || '#34d399';
  ctx.lineWidth = opts.lineWidth || 4;
  ctx.stroke();
  ctx.fillStyle = opts.fg || '#ecfdf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    ctx.font =
      i === 0
        ? `bold ${opts.titleSize || 26}px system-ui, sans-serif`
        : `${opts.bodySize || 16}px system-ui, sans-serif`;
    ctx.fillText(lines[i], w / 2, (h / (n + 1)) * (i + 1) + (i === 0 ? 2 : 0), w - 36);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      depthWrite: false,
      transparent: true
    })
  );
  const longest = Math.max(...lines.map((s) => s.length));
  spr.scale.set(opts.scaleX || Math.min(4.2, 1.2 + longest * 0.045), opts.scaleY || 0.85, 1);
  spr.position.y = opts.y ?? PANEL.height + 0.55;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `wall-showroom-label-${lines[0]}`;
  return spr;
}

function applyCameraHint(hint) {
  const rig = typeof window !== 'undefined' ? window.__cityCamRig : null;
  if (!rig || !rig.camera) return;
  rig.camera.position.set(hint.x, hint.y, hint.z);
  rig.camera.lookAt(hint.lookAt.x, hint.lookAt.y, hint.lookAt.z);
  if (typeof rig.applyState === 'function') {
    rig.applyState(
      {
        mode: 'orbit',
        x: hint.x,
        y: hint.y,
        z: hint.z,
        tx: hint.lookAt.x,
        ty: hint.lookAt.y,
        tz: hint.lookAt.z
      },
      null,
      null
    );
  } else if (typeof rig.setMode === 'function') {
    rig.setMode('orbit');
  }
}

/**
 * Spawn the wall paint showroom under cityGroup.
 * @param {THREE.Object3D} cityGroup
 */
export async function spawnWallPaintShowroom(cityGroup) {
  const root = new THREE.Group();
  root.name = 'wall-paint-showroom';
  root.position.set(SHOWROOM_ORIGIN.x, SHOWROOM_ORIGIN.y, SHOWROOM_ORIGIN.z);
  cityGroup.add(root);

  /** @type {Array<{id:string, pt:string, category:string, categoryHeader:string, origin:object, pad:THREE.Object3D}>} */
  const inventory = [];

  // Preload all albedos in parallel (skip missing).
  /** @type {Map<string, THREE.Texture|null>} */
  const maps = new Map();
  const allIds = CATEGORIES.flatMap((c) => c.items.map((it) => it.id));
  await Promise.all(
    allIds.map(async (id) => {
      maps.set(id, await loadAlbedo(id));
    })
  );

  // Shared plane geo (faces +Z by default; we face panels toward −Z approach).
  const planeGeo = new THREE.PlaneGeometry(PANEL.width, PANEL.height);
  const plinthMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xb8a078).multiplyScalar(1.02),
    name: 'wallShowroom-plinth',
    toneMapped: true
  });

  let sectionZ = 0;
  const categoryMeta = [];

  for (const cat of CATEGORIES) {
    const section = new THREE.Group();
    section.name = `wall-showroom-section-${cat.id}`;
    section.position.set(0, 0, sectionZ);
    root.add(section);

    const header = makeLabelSprite([cat.header, 'Poly Haven CC0 · 1k diffuse'], {
      w: 720,
      h: 100,
      scaleX: 5.5,
      scaleY: 0.95,
      titleSize: 32,
      bodySize: 16,
      y: PANEL.height + 1.35,
      stroke: cat.stroke
    });
    // Centre header over the first few panels.
    const nInCat = cat.items.filter((it) => maps.get(it.id)).length;
    const colsUsed = Math.min(COLS, Math.max(1, nInCat));
    header.position.set(((colsUsed - 1) * PANEL_SPACING_X) * 0.5, 0, -1.4);
    section.add(header);

    let placedInCat = 0;
    let maxRow = 0;
    for (let i = 0; i < cat.items.length; i++) {
      const item = cat.items[i];
      const map = maps.get(item.id);
      if (!map) continue;

      const col = placedInCat % COLS;
      const row = Math.floor(placedInCat / COLS);
      maxRow = Math.max(maxRow, row);
      placedInCat += 1;

      const pad = new THREE.Group();
      pad.name = `wall-panel-${item.id}`;
      // Rows grow south (−Z) within section; leave aisle in front (−Z of panel).
      pad.position.set(col * PANEL_SPACING_X, 0, -row * SECTION_GAP_Z);
      section.add(pad);

      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL.width + 0.25, 0.06, 0.55),
        plinthMat
      );
      plinth.position.set(0, 0.03, 0);
      plinth.frustumCulled = false;
      pad.add(plinth);

      // Mild warm lift so panels read outdoors under ACES / MeshBasic.
      const color = new THREE.Color(0xffffff);
      color.multiplyScalar(1.02);
      const mat = new THREE.MeshBasicMaterial({
        color,
        map,
        name: `wallShowroom-${item.id}`,
        toneMapped: true,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.name = `wall-panel-mesh-${item.id}`;
      mesh.position.set(0, 0.06 + PANEL.height * 0.5, 0);
      // Face −Z so approach from south (more negative z) reads the albedo.
      mesh.rotation.y = Math.PI;
      mesh.frustumCulled = false;
      pad.add(mesh);

      const label = makeLabelSprite([item.pt, item.id], {
        w: 560,
        h: 96,
        scaleX: 2.6,
        scaleY: 0.72,
        titleSize: 24,
        bodySize: 14,
        y: PANEL.height + 0.72,
        stroke: cat.stroke
      });
      label.position.set(0, 0, -0.35);
      pad.add(label);

      const worldOrigin = {
        x: SHOWROOM_ORIGIN.x + pad.position.x,
        y: SHOWROOM_ORIGIN.y,
        z: SHOWROOM_ORIGIN.z + section.position.z + pad.position.z
      };
      inventory.push({
        id: item.id,
        pt: item.pt,
        category: cat.id,
        categoryHeader: cat.header,
        origin: worldOrigin,
        pad
      });
    }

    const rowsUsed = maxRow + 1;
    categoryMeta.push({
      id: cat.id,
      header: cat.header,
      count: placedInCat,
      localZ: sectionZ,
      rows: rowsUsed
    });
    // Next section south of this one's rows + aisle.
    sectionZ -= rowsUsed * SECTION_GAP_Z + 3.5;
  }

  const howToFind =
    `Showroom de tintas/texturas de parede (Poly Haven CC0) na grama livre ` +
    `ao sul dos candidatos de apt (~238,−10). Origem ~x=${SHOWROOM_ORIGIN.x}, ` +
    `z=${SHOWROOM_ORIGIN.z}. Painéis ~${PANEL.width}×${PANEL.height} m, face −Z. ` +
    `Seções: Tintas/Gesso · Madeira/Painéis · Tijolo · Concreto · Outros. ` +
    `${inventory.length} painéis. API: window.__cityWallShowroom.visit() / visit(id).`;

  function visit(id) {
    let target = inventory[0];
    if (id != null && id !== '') {
      const found = inventory.find((p) => p.id === id || p.pt === id);
      if (found) target = found;
      else return { error: `unknown id ${id}`, inventoryIds: inventory.map((p) => p.id) };
    }
    const hint = {
      x: target.origin.x,
      y: 1.6,
      z: target.origin.z - 4.2,
      lookAt: {
        x: target.origin.x,
        y: PANEL.height * 0.55,
        z: target.origin.z
      }
    };
    applyCameraHint(hint);
    return { panel: target, cameraHint: hint, howToFind, count: inventory.length };
  }

  const api = {
    root,
    origin: { ...SHOWROOM_ORIGIN },
    panelSize: { ...PANEL },
    howToFind,
    visit,
    inventory: inventory.map((p) => ({
      id: p.id,
      pt: p.pt,
      category: p.category,
      categoryHeader: p.categoryHeader,
      origin: { ...p.origin }
    })),
    count: inventory.length,
    categories: categoryMeta
  };

  window.__cityWallShowroom = api;
  console.log('[wall-showroom] ready —', howToFind);
  return api;
}
