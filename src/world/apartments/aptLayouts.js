/**
 * 100 apartment layout recipes — hitch-friendly shared-instance path (spec 05).
 *
 * Buildings: layoutId = stableHash(facadeId, slotIndex) % 100
 *   → furnitureVariant (0..19) + wallVariant (0..19) stamped via InstancedMesh pools
 * Staging: full 100 recipes (poses + wall) on the review strip.
 *
 * Distinct looks = furniture set ∪ poses ∪ wall albedo (not unique Mesh clones).
 */

export const LAYOUT_COUNT = 100;
export const FURNITURE_VARIANT_COUNT = 20;
export const WALL_VARIANT_COUNT = 20;

/** Official building room (spec 05). */
export const ROOM = { width: 3.6, depth: 3.2, height: 2.75, wallT: 0.07 };

/**
 * Curated wall albedos from the showroom set (20 for building IM pools).
 * Full 58 still cycle on the review strip via layout.wall.
 */
export const WALL_POOL = [
  'painted_plaster_wall',
  'patterned_plaster_wall',
  'plastered_wall',
  'white_plaster_02',
  'white_stucco',
  'blue_plaster_wall',
  'beige_wall_001',
  'grey_plaster',
  'brick_wall_001',
  'painted_brick',
  'large_red_bricks',
  'dark_paneled_wood',
  'hinoki_planks',
  'concrete_wall_001',
  'clay_plaster',
  'damaged_plaster',
  'plaster_brick_01',
  'blue_painted_planks',
  'red_plaster_weathered',
  'oriented_strand_board'
];

/** All showroom wall folder ids (58) — cycle across 100 layouts for staging variety. */
export const ALL_WALL_IDS = [
  'painted_plaster_wall',
  'patterned_plaster_wall',
  'plastered_wall',
  'white_plaster_02',
  'white_stucco',
  'beige_wall_001',
  'beige_wall_002',
  'blue_plaster_wall',
  'blue_plaster_weathered',
  'grey_plaster',
  'grey_plaster_02',
  'grey_plaster_03',
  'plaster_grey_04',
  'damaged_plaster',
  'patterned_clay_plaster',
  'patterned_clay_wall',
  'plastered_wall_02',
  'plastered_wall_03',
  'plastered_wall_04',
  'plastered_wall_05',
  'red_plaster_weathered',
  'peeling_painted_wall',
  'clay_plaster',
  'concrete_wall_001',
  'concrete_wall_003',
  'concrete_wall_004',
  'concrete_wall_005',
  'decrepit_wallpaper',
  'dark_paneled_wood',
  'black_painted_planks',
  'blue_painted_planks',
  'distressed_painted_planks',
  'brown_planks_05',
  'hinoki_planks',
  'japanese_cedar_planks',
  'raw_plank_wall',
  'oriented_strand_board',
  'painted_brick',
  'painted_worn_brick',
  'brick_wall_001',
  'brick_wall_08',
  'wall_bricks_plaster',
  'plaster_brick_01',
  'plaster_brick_pattern',
  'red_brick_plaster_patch_02',
  'patterned_brick_wall',
  'large_red_bricks',
  'concrete_slab_wall',
  'herringbone_concrete_tile',
  'precast_concrete_wall',
  'ribbed_concrete_wall',
  'patterned_concrete_wall',
  'bamboo_wall',
  'clay_block_wall',
  'exterior_wall_cladding',
  'rectangular_facade_tiles',
  'concrete_tile_facade',
  'ceiling_interior'
];

export function wallUrl(id) {
  return `/textures/walls/${id}/${id}_diff_1k.jpg`;
}

/**
 * Stable FNV-1a style hash → uint32.
 * @param {string} facadeId
 * @param {number} slotIndex
 */
export function stableHash(facadeId, slotIndex) {
  const s = `${facadeId}#${slotIndex | 0}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function layoutIdFromSlot(facadeId, slotIndex) {
  return stableHash(facadeId, slotIndex) % LAYOUT_COUNT;
}

/** Mulberry32 PRNG for reproducible layout generation. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const THEME_META = [
  { id: 'living-classico', label: 'Living clássico', group: 'living' },
  { id: 'tv-lounge', label: 'TV lounge', group: 'living' },
  { id: 'dining', label: 'Dining', group: 'dining' },
  { id: 'study', label: 'Study', group: 'study' },
  { id: 'kitchenette', label: 'Kitchenette', group: 'kitchen' },
  { id: 'bedroom-ish', label: 'Bedroom-ish', group: 'bed' },
  { id: 'plant-heavy', label: 'Plant heavy', group: 'plants' },
  { id: 'minimal', label: 'Minimal', group: 'minimal' },
  { id: 'maximal', label: 'Maximal', group: 'maximal' },
  { id: 'brick-loft', label: 'Brick loft', group: 'loft' },
  { id: 'blue-plaster', label: 'Blue plaster', group: 'living' },
  { id: 'reading-nook', label: 'Reading nook', group: 'study' },
  { id: 'compact-sofa', label: 'Compact sofa', group: 'living' },
  { id: 'gallery', label: 'Gallery wall', group: 'maximal' },
  { id: 'zen-jp', label: 'Zen JP', group: 'minimal' },
  { id: 'media-wall', label: 'Media wall', group: 'living' },
  { id: 'chef', label: 'Chef corner', group: 'kitchen' },
  { id: 'guest', label: 'Guest lounge', group: 'living' },
  { id: 'studio-desk', label: 'Studio desk', group: 'study' },
  { id: 'cozy-rug', label: 'Cozy rug', group: 'living' }
];

/**
 * 20 canonical furniture pose tables (yaw-only, floored).
 * Room local: X∈[-1.8,1.8], Z∈[0,3.2], open −Z.
 * Piece names from loft + novopo + kit.
 */
function buildFurnitureTemplates() {
  const T = [];
  // 0 living classico
  T.push([
    { name: 'rug', x: 0, z: 1.5, yaw: 0 },
    { name: 'sofa', x: 0.05, z: 2.05, yaw: Math.PI },
    { name: 'coffee', x: 0, z: 1.05, yaw: 0 },
    { name: 'console', x: 1.45, z: 1.85, yaw: -Math.PI / 2 },
    { name: 'plant', x: 1.35, z: 0.4, yaw: 0.25 },
    { name: 'wallart', x: -1.55, y: 1.2, z: 1.55, yaw: Math.PI / 2 }
  ]);
  // 1 tv lounge
  T.push([
    { name: 'rug', x: 0.05, z: 1.45, yaw: 0.1 },
    { name: 'mini_sofa', x: 0, z: 2.35, yaw: Math.PI },
    { name: 'ph_tv', x: 0, z: 0.35, yaw: 0 },
    { name: 'mini_console', x: 0, z: 0.55, yaw: 0 },
    { name: 'mini_lounge', x: -1.25, z: 1.55, yaw: Math.PI * 0.55 },
    { name: 'mini_coffee', x: 0.15, z: 1.35, yaw: 0.2 },
    { name: 'plant', x: 1.4, z: 2.4, yaw: -0.3 }
  ]);
  // 2 dining
  T.push([
    { name: 'rug', x: 0, z: 1.55, yaw: 0 },
    { name: 'l6_dining', x: 0, z: 1.55, yaw: 0 },
    { name: 'chair2_1', x: -0.85, z: 1.15, yaw: Math.PI * 0.5 },
    { name: 'chair2_2', x: 0.85, z: 1.15, yaw: -Math.PI * 0.5 },
    { name: 'chair2_3', x: -0.85, z: 1.95, yaw: Math.PI * 0.5 },
    { name: 'chair2_4', x: 0.85, z: 1.95, yaw: -Math.PI * 0.5 },
    { name: 'plant', x: 1.45, z: 0.45, yaw: 0.4 },
    { name: 'console', x: -1.45, z: 2.5, yaw: Math.PI / 2 }
  ]);
  // 3 study
  T.push([
    { name: 'rug', x: 0.1, z: 1.6, yaw: 0.05 },
    { name: 'console', x: 0.15, z: 2.55, yaw: 0 },
    { name: 'chair', x: 0.15, z: 1.85, yaw: 0 },
    { name: 'shelf_1', x: -1.5, z: 2.0, yaw: Math.PI / 2 },
    { name: 'plant', x: 1.4, z: 0.5, yaw: 0.2 },
    { name: 'l2_side_table', x: 1.35, z: 2.35, yaw: 0.3 },
    { name: 'wallart', x: 1.55, y: 1.35, z: 1.4, yaw: -Math.PI / 2 }
  ]);
  // 4 kitchenette
  T.push([
    { name: 'mini_rug', x: 0.2, z: 1.6, yaw: 0 },
    { name: 'fridge', x: -1.45, z: 2.55, yaw: Math.PI / 2 },
    { name: 'oven', x: 1.4, z: 2.55, yaw: -Math.PI / 2 },
    { name: 'sink', x: 0.1, z: 2.7, yaw: Math.PI },
    { name: 'cabinet', x: -1.45, z: 1.6, yaw: Math.PI / 2 },
    { name: 'mini_table', x: 0.15, z: 1.2, yaw: 0.15 },
    { name: 'chair2_1', x: 0.15, z: 0.55, yaw: 0 },
    { name: 'q_plant', x: 1.4, z: 0.45, yaw: 0.2 }
  ]);
  // 5 bedroom-ish
  T.push([
    { name: 'bed_rug', x: 0, z: 1.7, yaw: 0 },
    { name: 'bed_platform', x: 0.1, z: 2.2, yaw: Math.PI },
    { name: 'bed_nightstand', x: -1.35, z: 2.4, yaw: Math.PI / 2 },
    { name: 'bed_plant', x: 1.4, z: 0.5, yaw: 0 },
    { name: 'chair', x: -1.2, z: 1.0, yaw: Math.PI * 0.7 },
    { name: 'wallart', x: 1.55, y: 1.4, z: 1.8, yaw: -Math.PI / 2 }
  ]);
  // 6 plant heavy
  T.push([
    { name: 'jp_rug_round', x: 0, z: 1.5, yaw: 0 },
    { name: 'plant', x: -1.35, z: 0.45, yaw: 0.2 },
    { name: 'l2_plant', x: 1.35, z: 0.5, yaw: -0.2 },
    { name: 'l13_plant_a', x: -1.3, z: 2.4, yaw: 0.4 },
    { name: 'l13_plant_b', x: 1.3, z: 2.35, yaw: -0.3 },
    { name: 'q_plant', x: 0, z: 2.6, yaw: 0.1 },
    { name: 'q_plant_b', x: 0.9, z: 1.5, yaw: 0.5 },
    { name: 'l2_coffee', x: -0.2, z: 1.2, yaw: 0.3 },
    { name: 'chair', x: -0.9, z: 1.7, yaw: Math.PI * 0.6 }
  ]);
  // 7 minimal
  T.push([
    { name: 'jp_rug_round', x: 0, z: 1.5, yaw: 0 },
    { name: 'chair', x: -0.35, z: 1.7, yaw: Math.PI * 0.85 },
    { name: 'l2_plant', x: 1.3, z: 0.55, yaw: 0.15 },
    { name: 'l2_coffee', x: 0.2, z: 1.05, yaw: 0.4 }
  ]);
  // 8 maximal
  T.push([
    { name: 'l13_rug', x: 0, z: 1.55, yaw: 0 },
    { name: 'l13_sofa', x: 0.1, z: 2.3, yaw: Math.PI },
    { name: 'l13_table', x: 0.1, z: 1.35, yaw: 0.1 },
    { name: 'l13_ottoman', x: -1.1, z: 1.5, yaw: 0.4 },
    { name: 'l13_console', x: 1.45, z: 2.0, yaw: -Math.PI / 2 },
    { name: 'l13_plant_c', x: -1.4, z: 0.45, yaw: 0.2 },
    { name: 'shelf_2', x: -1.5, z: 1.8, yaw: Math.PI / 2 },
    { name: 'ph_tv', x: 1.4, z: 0.5, yaw: -Math.PI / 2 },
    { name: 'tray', x: 0.1, z: 1.35, yaw: 0 }
  ]);
  // 9 brick loft vibe (furniture; wall chosen separately)
  T.push([
    { name: 'rug', x: 0, z: 1.55, yaw: 0 },
    { name: 'q_couch', x: 0.05, z: 2.2, yaw: Math.PI },
    { name: 'ph_coffee', x: 0.05, z: 1.15, yaw: 0.15 },
    { name: 'bar', x: -1.4, z: 2.0, yaw: Math.PI / 2 },
    { name: 'q_bookshelf', x: 1.45, z: 1.9, yaw: -Math.PI / 2 },
    { name: 'q_plant', x: 1.35, z: 0.4, yaw: 0.2 },
    { name: 'wallart', x: -1.55, y: 1.3, z: 1.2, yaw: Math.PI / 2 }
  ]);
  // 10 blue plaster living
  T.push([
    { name: 'mini_rug', x: 0, z: 1.5, yaw: 0 },
    { name: 'ph_sofa', x: 0, z: 2.15, yaw: Math.PI },
    { name: 'ph_coffee', x: 0, z: 1.1, yaw: 0 },
    { name: 'ph_shelf', x: -1.5, z: 1.8, yaw: Math.PI / 2 },
    { name: 'plant', x: 1.4, z: 0.45, yaw: 0.3 },
    { name: 'l2_side_table', x: 1.35, z: 2.35, yaw: 0 }
  ]);
  // 11 reading nook
  T.push([
    { name: 'l2_rug', x: 0.1, z: 1.55, yaw: 0 },
    { name: 'bed_egg_chair', x: -0.9, z: 1.7, yaw: Math.PI * 0.7 },
    { name: 'ph_shelf', x: 1.45, z: 2.0, yaw: -Math.PI / 2 },
    { name: 'l2_side_table', x: -1.35, z: 1.1, yaw: 0.2 },
    { name: 'plant', x: 1.3, z: 0.45, yaw: 0 },
    { name: 'clock_stand', x: -1.4, z: 2.5, yaw: 0.4 },
    { name: 'wallart', x: -1.55, y: 1.4, z: 1.6, yaw: Math.PI / 2 }
  ]);
  // 12 compact sofa
  T.push([
    { name: 'mini_rug', x: 0, z: 1.45, yaw: 0 },
    { name: 'q_couch_s', x: 0.1, z: 2.25, yaw: Math.PI },
    { name: 'q_table_s', x: 0.1, z: 1.2, yaw: 0.2 },
    { name: 'q_chair', x: -1.25, z: 1.5, yaw: Math.PI * 0.55 },
    { name: 'q_plant', x: 1.35, z: 0.5, yaw: 0.1 }
  ]);
  // 13 gallery
  T.push([
    { name: 'rug', x: 0, z: 1.5, yaw: 0 },
    { name: 'mini_sofa', x: 0.2, z: 2.3, yaw: Math.PI },
    { name: 'coffee', x: 0.2, z: 1.2, yaw: 0 },
    { name: 'wallart', x: -1.55, y: 1.35, z: 1.2, yaw: Math.PI / 2 },
    { name: 'l6_art', x: -1.55, y: 1.35, z: 2.2, yaw: Math.PI / 2 },
    { name: 'l2_art', x: 1.55, y: 1.35, z: 1.5, yaw: -Math.PI / 2 },
    { name: 'plant', x: 1.35, z: 0.4, yaw: 0.2 },
    { name: 'console', x: 1.4, z: 2.4, yaw: -Math.PI / 2 }
  ]);
  // 14 zen jp
  T.push([
    { name: 'jp_mat_a', x: 0, z: 1.5, yaw: 0 },
    { name: 'jp_table_geo', x: 0, z: 1.45, yaw: 0 },
    { name: 'jp_wood_bench', x: -1.2, z: 1.5, yaw: Math.PI / 2 },
    { name: 'jp_cushion', x: 0.9, z: 1.0, yaw: 0.3 },
    { name: 'jp_paper_lantern', x: 1.35, z: 2.4, yaw: 0 },
    { name: 'l2_plant', x: -1.35, z: 0.5, yaw: 0.2 }
  ]);
  // 15 media wall
  T.push([
    { name: 'l6_rug', x: 0, z: 1.5, yaw: 0 },
    { name: 'l6_sofa', x: 0, z: 2.35, yaw: Math.PI },
    { name: 'ph_tv', x: 0, z: 0.4, yaw: 0 },
    { name: 'mini_console', x: 0, z: 0.6, yaw: 0 },
    { name: 'l6_coffee_a', x: 0, z: 1.35, yaw: 0.1 },
    { name: 'plant', x: 1.4, z: 2.4, yaw: -0.2 },
    { name: 'q_plant_b', x: -1.4, z: 0.45, yaw: 0.3 }
  ]);
  // 16 chef
  T.push([
    { name: 'mini_kitchen', x: -0.2, z: 2.5, yaw: Math.PI },
    { name: 'fridge', x: 1.4, z: 2.5, yaw: -Math.PI / 2 },
    { name: 'oven_large', x: -1.4, z: 2.5, yaw: Math.PI / 2 },
    { name: 'l6_island', x: 0.1, z: 1.4, yaw: 0 },
    { name: 'chair2_1', x: -0.7, z: 0.85, yaw: Math.PI * 0.5 },
    { name: 'chair2_2', x: 0.7, z: 0.85, yaw: -Math.PI * 0.5 },
    { name: 'q_plant', x: 1.4, z: 0.4, yaw: 0 }
  ]);
  // 17 guest lounge
  T.push([
    { name: 'rug', x: 0, z: 1.55, yaw: 0 },
    { name: 'l6_sofa_b', x: -0.6, z: 2.25, yaw: Math.PI * 0.95 },
    { name: 'mini_lounge', x: 1.15, z: 1.7, yaw: -Math.PI * 0.55 },
    { name: 'l6_coffee_b', x: 0.1, z: 1.25, yaw: 0.25 },
    { name: 'console', x: 1.45, z: 0.55, yaw: -Math.PI / 2 },
    { name: 'plant', x: -1.4, z: 0.45, yaw: 0.2 }
  ]);
  // 18 studio desk
  T.push([
    { name: 'mini_rug', x: 0.15, z: 1.55, yaw: 0 },
    { name: 'mini_table', x: 0.2, z: 2.4, yaw: 0 },
    { name: 'chair2_3', x: 0.2, z: 1.75, yaw: 0 },
    { name: 'ph_shelf', x: -1.5, z: 2.0, yaw: Math.PI / 2 },
    { name: 'shelf_3', x: 1.5, z: 2.0, yaw: -Math.PI / 2 },
    { name: 'l2_plant', x: 1.35, z: 0.45, yaw: 0.15 },
    { name: 'ph_tv', x: -1.4, z: 0.5, yaw: Math.PI / 2 }
  ]);
  // 19 cozy rug
  T.push([
    { name: 'l13_rug', x: 0, z: 1.5, yaw: 0.05 },
    { name: 'sofa', x: 0.1, z: 2.15, yaw: Math.PI },
    { name: 'coffee', x: 0.1, z: 1.1, yaw: 0.1 },
    { name: 'chair', x: -1.25, z: 1.4, yaw: Math.PI * 0.6 },
    { name: 'plant', x: 1.35, z: 0.4, yaw: 0.25 },
    { name: 'tray', x: 0.1, z: 1.1, yaw: 0 },
    { name: 'wallart', x: 1.55, y: 1.25, z: 1.7, yaw: -Math.PI / 2 }
  ]);
  return T;
}

const FURNITURE_TEMPLATES = buildFurnitureTemplates();

/**
 * Fit defaults for kit + common novopo pieces (metres).
 */
export const PIECE_FIT = {
  sofa: { targetHeight: 0.6, maxWidth: 1.9, maxDepth: 1.35 },
  chair: { targetHeight: 0.75, maxWidth: 0.8, maxDepth: 1.0 },
  coffee: { targetHeight: 0.26, maxWidth: 0.9, maxDepth: 0.9 },
  console: { targetHeight: 0.5, maxWidth: 0.9, maxDepth: 0.5 },
  bar: { targetHeight: 0.85, maxWidth: 1.0, maxDepth: 0.5 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55 },
  tray: { targetHeight: 0.12, maxWidth: 0.4, maxDepth: 0.4 },
  wallart: { targetHeight: 0.7, maxWidth: 0.9, maxDepth: 0.1 },
  rug: { targetHeight: 0.015, maxWidth: 2.2, maxDepth: 2.4 },
  fridge: { targetHeight: 1.75, maxWidth: 0.75, maxDepth: 0.75 },
  oven: { targetHeight: 0.95, maxWidth: 0.7, maxDepth: 0.7 },
  oven_large: { targetHeight: 1.05, maxWidth: 0.85, maxDepth: 0.75 },
  sink: { targetHeight: 0.95, maxWidth: 0.85, maxDepth: 0.7 },
  cabinet: { targetHeight: 0.9, maxWidth: 0.7, maxDepth: 0.6 },
  q_couch: { targetHeight: 0.7, maxWidth: 2.0, maxDepth: 1.1 },
  q_couch_s: { targetHeight: 0.65, maxWidth: 1.5, maxDepth: 1.0 },
  q_chair: { targetHeight: 0.85, maxWidth: 0.55, maxDepth: 0.6 },
  q_plant: { targetHeight: 1.0, maxWidth: 0.5, maxDepth: 0.5 },
  q_plant_b: { targetHeight: 1.1, maxWidth: 0.45, maxDepth: 0.45 },
  q_bookshelf: { targetHeight: 1.6, maxWidth: 0.9, maxDepth: 0.4 },
  q_table: { targetHeight: 0.75, maxWidth: 1.4, maxDepth: 1.4 },
  q_table_s: { targetHeight: 0.7, maxWidth: 0.9, maxDepth: 0.9 },
  ph_sofa: { targetHeight: 0.75, maxWidth: 2.0, maxDepth: 1.0 },
  ph_tv: { targetHeight: 0.55, maxWidth: 0.85, maxDepth: 0.55 },
  ph_shelf: { targetHeight: 1.7, maxWidth: 0.95, maxDepth: 0.4 },
  ph_coffee: { targetHeight: 0.4, maxWidth: 1.2, maxDepth: 0.85 },
  jp_rug_round: { targetHeight: 0.02, maxWidth: 1.8, maxDepth: 1.8 },
  l6_dining: { targetHeight: 0.78, maxWidth: 2.0, maxDepth: 1.4 },
  l6_coffee_a: { targetHeight: 0.4, maxWidth: 1.1, maxDepth: 1.0 },
  l6_coffee_b: { targetHeight: 0.4, maxWidth: 1.1, maxDepth: 1.0 },
  l6_sofa: { targetHeight: 0.65, maxWidth: 2.0, maxDepth: 1.5 },
  l6_sofa_b: { targetHeight: 0.65, maxWidth: 2.0, maxDepth: 1.5 },
  l6_island: { targetHeight: 0.9, maxWidth: 1.6, maxDepth: 0.9 },
  l6_kitchen: { targetHeight: 1.0, maxWidth: 2.2, maxDepth: 0.7 },
  l6_rug: { targetHeight: 0.02, maxWidth: 2.2, maxDepth: 2.2 },
  l6_art: { targetHeight: 0.7, maxWidth: 0.7, maxDepth: 0.1 },
  l2_chair: { targetHeight: 0.85, maxWidth: 0.9, maxDepth: 0.95 },
  l2_coffee: { targetHeight: 0.4, maxWidth: 1.0, maxDepth: 0.9 },
  l2_plant: { targetHeight: 1.1, maxWidth: 0.7, maxDepth: 0.7 },
  l2_side_table: { targetHeight: 0.55, maxWidth: 0.7, maxDepth: 0.7 },
  l2_rug: { targetHeight: 0.02, maxWidth: 2.0, maxDepth: 2.0 },
  l2_art: { targetHeight: 0.7, maxWidth: 0.7, maxDepth: 0.1 },
  mini_sofa: { targetHeight: 0.55, maxWidth: 1.6, maxDepth: 1.1 },
  mini_lounge: { targetHeight: 0.7, maxWidth: 1.2, maxDepth: 1.1 },
  mini_coffee: { targetHeight: 0.28, maxWidth: 0.85, maxDepth: 0.85 },
  mini_console: { targetHeight: 0.55, maxWidth: 1.0, maxDepth: 0.45 },
  mini_table: { targetHeight: 0.75, maxWidth: 1.2, maxDepth: 1.0 },
  mini_kitchen: { targetHeight: 1.0, maxWidth: 1.8, maxDepth: 0.7 },
  mini_rug: { targetHeight: 0.015, maxWidth: 2.0, maxDepth: 2.0 },
  chair2_1: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_2: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_3: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  chair2_4: { targetHeight: 0.8, maxWidth: 0.55, maxDepth: 0.6 },
  jp_table_geo: { targetHeight: 0.75, maxWidth: 1.5, maxDepth: 1.1 },
  jp_wood_bench: { targetHeight: 0.4, maxWidth: 0.55, maxDepth: 1.3 },
  jp_mat_a: { targetHeight: 0.02, maxWidth: 1.8, maxDepth: 1.8 },
  jp_cushion: { targetHeight: 0.2, maxWidth: 0.5, maxDepth: 0.5 },
  jp_paper_lantern: { targetHeight: 0.7, maxWidth: 0.4, maxDepth: 0.4 },
  shelf_1: { targetHeight: 1.4, maxWidth: 0.9, maxDepth: 0.4 },
  shelf_2: { targetHeight: 1.4, maxWidth: 0.9, maxDepth: 0.4 },
  shelf_3: { targetHeight: 1.4, maxWidth: 0.9, maxDepth: 0.4 },
  clock_stand: { targetHeight: 1.2, maxWidth: 0.45, maxDepth: 0.45 },
  bed_platform: { targetHeight: 0.55, maxWidth: 2.0, maxDepth: 1.6 },
  bed_nightstand: { targetHeight: 0.55, maxWidth: 0.5, maxDepth: 0.5 },
  bed_plant: { targetHeight: 1.0, maxWidth: 0.5, maxDepth: 0.5 },
  bed_rug: { targetHeight: 0.015, maxWidth: 2.2, maxDepth: 2.2 },
  bed_egg_chair: { targetHeight: 1.1, maxWidth: 1.0, maxDepth: 1.0 },
  l13_sofa: { targetHeight: 0.7, maxWidth: 2.0, maxDepth: 1.2 },
  l13_table: { targetHeight: 0.4, maxWidth: 1.1, maxDepth: 1.0 },
  l13_ottoman: { targetHeight: 0.4, maxWidth: 0.7, maxDepth: 0.7 },
  l13_console: { targetHeight: 0.55, maxWidth: 1.0, maxDepth: 0.45 },
  l13_plant_a: { targetHeight: 1.1, maxWidth: 0.55, maxDepth: 0.55 },
  l13_plant_b: { targetHeight: 1.1, maxWidth: 0.55, maxDepth: 0.55 },
  l13_plant_c: { targetHeight: 1.1, maxWidth: 0.55, maxDepth: 0.55 },
  l13_rug: { targetHeight: 0.02, maxWidth: 2.2, maxDepth: 2.2 }
};

export function fitFor(name) {
  if (PIECE_FIT[name]) return PIECE_FIT[name];
  if (name.startsWith('chair')) return PIECE_FIT.chair;
  if (name.includes('plant')) return PIECE_FIT.plant;
  if (name.includes('rug') || name.includes('mat')) return PIECE_FIT.rug;
  return { targetHeight: 0.7, maxWidth: 1.2, maxDepth: 1.2 };
}

/**
 * Clamp piece into room AABB with margin.
 */
function clampPiece(p) {
  const margin = 0.35;
  const hw = ROOM.width * 0.5 - margin;
  const z0 = margin;
  const z1 = ROOM.depth - margin;
  return {
    ...p,
    x: Math.max(-hw, Math.min(hw, p.x)),
    z: Math.max(z0, Math.min(z1, p.z)),
    y: p.y ?? 0,
    yaw: p.yaw ?? 0
  };
}

/**
 * Build 100 layouts (seeded). furnitureVariant 0..19, wall from pools.
 */
function buildLayouts() {
  const layouts = [];
  for (let i = 0; i < LAYOUT_COUNT; i++) {
    const furnitureVariant = i % FURNITURE_VARIANT_COUNT;
    // Spread walls so (furnitureVariant, wallVariant) is unique across 100 layouts.
    const wallVar =
      (Math.floor(i / FURNITURE_VARIANT_COUNT) * 4 + Math.floor((i % FURNITURE_VARIANT_COUNT) / 5)) %
      WALL_VARIANT_COUNT;
    const theme = THEME_META[furnitureVariant];
    const rand = mulberry32(0xa91 + i * 9973);
    const base = FURNITURE_TEMPLATES[furnitureVariant].map((p) => ({ ...p }));
    // Pose jitter so even same furnitureVariant feels alive across wall rows
    const pieces = base.map((p) => {
      const jx = (rand() - 0.5) * 0.18;
      const jz = (rand() - 0.5) * 0.16;
      const jyaw = (rand() - 0.5) * 0.22;
      return clampPiece({
        name: p.name,
        x: p.x + jx,
        y: p.y ?? 0,
        z: p.z + jz,
        yaw: (p.yaw ?? 0) + jyaw,
        scale: 1
      });
    });
    const wall = ALL_WALL_IDS[i % ALL_WALL_IDS.length];
    const wallPoolId = WALL_POOL[wallVar];
    layouts.push({
      id: i,
      index: i + 1,
      label: `Interior ${String(i + 1).padStart(3, '0')}`,
      themeId: theme.id,
      themeLabel: theme.label,
      group: theme.group,
      furnitureVariant,
      wallVariant: wallVar,
      wall, // staging / full showroom cycle
      wallPool: wallPoolId, // building IM wall
      pieces
    });
  }
  return layouts;
}

export const LAYOUTS = buildLayouts();

export function getLayout(i) {
  const n = ((i | 0) % LAYOUT_COUNT + LAYOUT_COUNT) % LAYOUT_COUNT;
  return LAYOUTS[n];
}

/** Canonical pieces for furnitureVariant bake (no jitter). */
export function getFurnitureTemplate(variant) {
  const v = ((variant | 0) % FURNITURE_VARIANT_COUNT + FURNITURE_VARIANT_COUNT) % FURNITURE_VARIANT_COUNT;
  return FURNITURE_TEMPLATES[v].map((p) => clampPiece({ ...p, y: p.y ?? 0, scale: 1 }));
}

export function getWallPoolId(variant) {
  const v = ((variant | 0) % WALL_VARIANT_COUNT + WALL_VARIANT_COUNT) % WALL_VARIANT_COUNT;
  return WALL_POOL[v];
}
