/**
 * Freestanding apartment interior **sandbox** on asphalt near Large_3 (≈171,30).
 *
 * Collaborative staging: empty shell on the marked street corner + labeled
 * furniture + cars + architecture catalog on the **grass** east of the room
 * (loft-5 + novopo furniture + novopo extras). Zones: furniture | cars | arch.
 *
 * Staging UX:
 * - **Wheel** (not furniture-dragging, pointer near staging): cycle catalog selection
 *   + highlight, including a **(nenhum)** deselect slot; does not zoom / change fly-speed.
 * - **HUD** bottom bar shows live thumbnail of the armed catalog sample (offscreen RT).
 * - **LMB** on ground (grass/asphalt plane or room floor): place the selected catalog
 *   item at hit xz, feet floored (no-op when nenhum). Over room footprint → shell; else world.
 * - **RMB drag**: camera pan (see ThirdPersonCamera) — not handled here.
 * - **1 / 2 / 3** (or Alt+W / Alt+E / Alt+R): Unreal-style TransformControls mode
 *   (translate / rotate / scale) on the selected placed or showcase piece.
 * - **Esc**: jump to (nenhum) — clear catalog arming without touching room/world gizmo.
 * - Click / drag catalog→room and in-room slide still work; while dragging a piece,
 *   wheel raises/lowers Y (0–2.5 m). Gizmo drag blocks camera look.
 *
 * NOT the InstancedMesh product bake (`roomTemplate.pushLoftPiece`).
 * MeshBasic only — no PointLight (Ultra night CPU).
 */

import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { loadGltf } from '../AssetLoader.js';
import { ASPHALT_SURFACE_Y } from '../RoadDimensions.js';
import { LOFT_FURNITURE_URL, NOVOPO_FURNITURE_URL, NOVOPO_EXTRAS_URL } from './roomTemplate.js';

/** Cache-bust so browser/disk cache cannot keep a tipped extract. */
const LOFT_URL = LOFT_FURNITURE_URL; // cache-bust lives on LOFT_FURNITURE_URL
const NOVOPO_URL = NOVOPO_FURNITURE_URL;
const NOVOPO_EXTRAS = NOVOPO_EXTRAS_URL;

/**
 * Large_3@171,30 east facade; green-rect corner on N–S asphalt (street x≈180).
 * Open face south (yaw=π) so approach looking north (~339°) sees into the room.
 * Catalog marches north (−Z) along the dashed lane (green arrows).
 */
export const APT_EXAMPLE_DEFAULT = {
  x: 182.0,
  y: ASPHALT_SURFACE_Y + 0.2,
  z: 22.0,
  yaw: Math.PI,
  facadeId: 'Large_3@171.00,30.00'
};

/** Loft-5 catalog (kept). */
export const LOFT_CATALOG_NAMES = [
  'sofa',
  'chair',
  'coffee',
  'console',
  'bar',
  'plant',
  'tray',
  'wallart',
  'rug'
];

/** Novopo multi-pack furniture/decor (jp11 + remaining interiors). */
export const NOVOPO_CATALOG_NAMES = [
  'jp_cushion',
  'jp_tea_set',
  'jp_geisha',
  'jp_moongate',
  'jp_stone_lantern',
  'jp_mat_a',
  'jp_mat_b',
  'jp_slat_mat',
  'jp_wood_bench',
  'jp_table_geo',
  'jp_art_roofs',
  'jp_art_street',
  'jp_shelf_ledge',
  'jp_knit_pillow',
  'jp_rug_round',
  'jp_paper_lantern',
  'jp_art_py',
  'jp_art_wind',
  'jp_art_py2',
  'jp_art_wind2',
  'l6_sofa',
  'l6_sofa_b',
  'l6_dining',
  'l6_kitchen',
  'l6_cabinet',
  'l6_island',
  'l6_coffee_a',
  'l6_coffee_b',
  'l6_tray',
  'l6_rug',
  'l6_art_tall',
  'l6_art',
  'l2_chair',
  'l2_coffee',
  'l2_side_table',
  'l2_plant',
  'l2_bust',
  'l2_pedestal',
  'l2_art',
  'l2_rug',
  'l2_pendant',
  'l13_sofa',
  'l13_chair_a',
  'l13_chair_b',
  'l13_chair_c',
  'l13_ottoman',
  'l13_table',
  'l13_console',
  'l13_rug',
  'l13_plant_a',
  'l13_plant_b',
  'l13_plant_c',
  'l13_pot',
  'l13_pillow_a',
  'l13_pillow_b',
  'l13_decor_small',
  'l13_art_carve',
  'bed_platform',
  'bed_egg_chair',
  'bed_nightstand',
  'bed_plant',
  'bed_pendant',
  'bed_books',
  'bed_rug',
  'bed_art_a',
  'bed_art_b',
  'mini_sofa',
  'mini_lounge',
  'mini_table',
  'mini_coffee',
  'mini_console',
  'mini_shelf',
  'mini_kitchen',
  'mini_rug',
  'i9_bed',
  'i9_rack',
  'i9_tire_rack',
  'i9_rug',
  'shelf_1',
  'shelf_2',
  'shelf_3',
  'shelf_4',
  'shelf_5',
  'shelf_6',
  'shelf_7',
  'chair2_1',
  'chair2_2',
  'chair2_3',
  'chair2_4',
  'chair2_5',
  'chair2_6',
  'clock_stand'
];

/** Cars from interior_9 (novopo_extras.glb). */
export const CAR_CATALOG_NAMES = ['car_a', 'car_b'];

/** Architecture panels / beams / windows / doors (novopo_extras.glb). */
export const ARCH_CATALOG_NAMES = [
  'arch_i9_slab',
  'arch_i9_floor',
  'arch_i9_wall',
  'arch_i9_windows',
  'arch_i9_wall_b',
  'arch_i9_garage_door',
  'arch_i9_wall_c',
  'arch_l6_beam',
  'arch_l6_ledge',
  'arch_l6_plank',
  'arch_l6_window',
  'arch_l6_pane',
  'arch_l2_beam',
  'arch_l2_ledge',
  'arch_l2_window',
  'arch_l2_window_b',
  'arch_l2_pipe',
  'arch_l2_stair',
  'arch_l13_beam',
  'arch_l13_ceiling',
  'arch_l13_plinth',
  'arch_bed_structure',
  'arch_bed_floor',
  'arch_bed_window',
  'arch_mini_shell',
  'arch_mini_window',
  'arch_jp_wall',
  'arch_jp_wall_b',
  'arch_jp_floor',
  'arch_jp_window'
];

/** Full catalog order: furniture, then cars, then architecture. */
export const CATALOG_NAMES = [
  ...LOFT_CATALOG_NAMES,
  ...NOVOPO_CATALOG_NAMES,
  ...CAR_CATALOG_NAMES,
  ...ARCH_CATALOG_NAMES
];

/**
 * Default in-room slots (room local: glass≈z=0, depth +Z, width X).
 * Used when `addFromCatalog` places a piece the first time (click fallback).
 */
const DEFAULT_SLOTS = {
  sofa: { x: 0.05, y: 0, z: 2.05, yaw: Math.PI, scale: 1 },
  chair: { x: -1.15, y: 0, z: 1.2, yaw: Math.PI * 0.65, scale: 1 },
  coffee: { x: 0.0, y: 0, z: 1.1, yaw: 0, scale: 1 },
  console: { x: 1.45, y: 0, z: 1.85, yaw: -Math.PI / 2, scale: 1 },
  bar: { x: 1.35, y: 0, z: 0.7, yaw: -Math.PI / 2, scale: 1 },
  plant: { x: 1.35, y: 0, z: 0.45, yaw: 0.25, scale: 1 },
  tray: { x: 0.35, y: 0.45, z: 1.1, yaw: 0.2, scale: 1 },
  wallart: { x: -1.55, y: 1.1, z: 1.6, yaw: Math.PI / 2, scale: 1 },
  rug: { x: 0.0, y: 0, z: 1.5, yaw: 0, scale: 1 },
  // Novopo JP — drop near room center; user can drag
  jp_cushion: { x: -0.6, y: 0, z: 1.4, yaw: 0.2, scale: 1 },
  jp_tea_set: { x: 0.2, y: 0, z: 1.1, yaw: 0.3, scale: 1 },
  jp_geisha: { x: 1.2, y: 0, z: 1.8, yaw: -0.4, scale: 1 },
  jp_moongate: { x: -1.3, y: 0, z: 2.0, yaw: Math.PI / 2, scale: 1 },
  jp_stone_lantern: { x: 1.3, y: 0, z: 0.55, yaw: 0.15, scale: 1 },
  jp_mat_a: { x: 0.0, y: 0, z: 1.6, yaw: 0, scale: 1 },
  jp_mat_b: { x: 0.0, y: 0, z: 1.5, yaw: 0.1, scale: 1 },
  jp_slat_mat: { x: 0.0, y: 0, z: 1.4, yaw: 0, scale: 1 },
  jp_wood_bench: { x: -0.9, y: 0, z: 1.5, yaw: Math.PI / 2, scale: 1 },
  jp_table_geo: { x: 0.1, y: 0, z: 1.2, yaw: 0.2, scale: 1 },
  jp_art_roofs: { x: -1.55, y: 1.0, z: 1.4, yaw: Math.PI / 2, scale: 1 },
  jp_art_street: { x: 1.55, y: 0.9, z: 1.5, yaw: -Math.PI / 2, scale: 1 },
  jp_shelf_ledge: { x: 0.0, y: 1.2, z: 2.9, yaw: 0, scale: 1 },
  jp_knit_pillow: { x: 0.5, y: 0, z: 1.3, yaw: 0.4, scale: 1 },
  jp_rug_round: { x: 0.0, y: 0, z: 1.5, yaw: 0, scale: 1 },
  jp_paper_lantern: { x: 0.0, y: 1.6, z: 1.5, yaw: 0, scale: 1 },
  jp_art_py: { x: -1.55, y: 1.2, z: 0.9, yaw: Math.PI / 2, scale: 1 },
  jp_art_wind: { x: 1.55, y: 1.2, z: 0.9, yaw: -Math.PI / 2, scale: 1 },
  jp_art_py2: { x: -1.55, y: 1.2, z: 2.2, yaw: Math.PI / 2, scale: 1 },
  jp_art_wind2: { x: 1.55, y: 1.2, z: 2.2, yaw: -Math.PI / 2, scale: 1 },
  // Remaining novopo packs — center drop; user drags
  l6_sofa: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_sofa_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_dining: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_kitchen: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_cabinet: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_island: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_coffee_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_coffee_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_tray: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_art_tall: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l6_art: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_chair: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_coffee: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_side_table: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_plant: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_bust: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_pedestal: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_art: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l2_pendant: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_sofa: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_chair_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_chair_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_chair_c: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_ottoman: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_table: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_console: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_plant_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_plant_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_plant_c: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_pot: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_pillow_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_pillow_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_decor_small: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  l13_art_carve: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_platform: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_egg_chair: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_nightstand: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_plant: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_pendant: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_books: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_art_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  bed_art_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_sofa: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_lounge: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_table: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_coffee: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_console: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_shelf: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_kitchen: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  mini_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  i9_bed: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  i9_rack: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  i9_tire_rack: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  i9_rug: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_1: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_2: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_3: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_4: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_5: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_6: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  shelf_7: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_1: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_2: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_3: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_4: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_5: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  chair2_6: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  clock_stand: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  // Cars + architecture — center drop; user drags (may be large)
  car_a: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  car_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_slab: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_floor: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_wall: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_windows: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_wall_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_garage_door: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_i9_wall_c: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l6_beam: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l6_ledge: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l6_plank: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l6_window: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l6_pane: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_beam: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_ledge: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_window: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_window_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_pipe: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l2_stair: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l13_beam: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l13_ceiling: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_l13_plinth: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_bed_structure: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_bed_floor: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_bed_window: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_mini_shell: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_mini_window: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_jp_wall: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_jp_wall_b: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_jp_floor: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 },
  arch_jp_window: { x: 0.0, y: 0, z: 1.4, yaw: 0.15, scale: 1 }
};

/**
 * Grass showcase zones east of the apt sandbox (outside asphalt lane).
 * Sidewalk/grass Y≈0; cols grow +X, rows grow −Z (north).
 * Furniture first, then a gap, cars (wider spacing), gap, architecture.
 */
const CATALOG_Y = 0.02; // sidewalk / grass top (ASPHALT is −0.15)
const CATALOG_YAW = Math.PI * 0.12;
const CATALOG_ZONE = {
  furniture: { x0: 188.0, z0: 28.0, dx: 1.7, dz: -1.7, cols: 10 },
  cars: { x0: 188.0, dx: 4.0, dz: -4.0, cols: 2, gapRows: 2 },
  architecture: { x0: 188.0, dx: 2.2, dz: -2.2, cols: 8, gapRows: 2 }
};

/**
 * Fit targets (metres) after upright normalize — silhouette through open face.
 * Sofa footprint is wide/deep in the GLB; keep maxDepth generous so uniform
 * scale does not pancake height.
 */
const FIT = {
  sofa: { targetHeight: 0.72, maxWidth: 2.15, maxDepth: 1.7 },
  chair: { targetHeight: 0.78, maxWidth: 0.85, maxDepth: 1.05 },
  coffee: { targetHeight: 0.28, maxWidth: 0.95, maxDepth: 0.95 },
  console: { targetHeight: 0.55, maxWidth: 0.95, maxDepth: 0.55 },
  bar: { targetHeight: 0.95, maxWidth: 1.15, maxDepth: 0.55 },
  plant: { targetHeight: 1.15, maxWidth: 0.55, maxDepth: 0.55 },
  tray: { targetHeight: 0.18, maxWidth: 0.45, maxDepth: 0.45 },
  wallart: { targetHeight: 0.85, maxWidth: 1.1, maxDepth: 0.12 },
  rug: { targetHeight: 0.02, maxWidth: 2.4, maxDepth: 2.8 },
  jp_cushion: { targetHeight: 0.32, maxWidth: 1.1, maxDepth: 1.1 },
  jp_tea_set: { targetHeight: 0.42, maxWidth: 0.85, maxDepth: 0.7 },
  jp_geisha: { targetHeight: 1.55, maxWidth: 0.85, maxDepth: 0.95 },
  jp_moongate: { targetHeight: 1.15, maxWidth: 1.2, maxDepth: 0.35 },
  jp_stone_lantern: { targetHeight: 0.85, maxWidth: 0.75, maxDepth: 0.75 },
  jp_mat_a: { targetHeight: 0.025, maxWidth: 1.8, maxDepth: 2.4 },
  jp_mat_b: { targetHeight: 0.025, maxWidth: 1.7, maxDepth: 2.3 },
  jp_slat_mat: { targetHeight: 0.06, maxWidth: 1.5, maxDepth: 2.2 },
  jp_wood_bench: { targetHeight: 0.32, maxWidth: 0.85, maxDepth: 1.6 },
  jp_table_geo: { targetHeight: 0.55, maxWidth: 1.7, maxDepth: 1.25 },
  jp_art_roofs: { targetHeight: 0.85, maxWidth: 0.85, maxDepth: 0.12 },
  jp_art_street: { targetHeight: 1.1, maxWidth: 0.7, maxDepth: 0.12 },
  jp_shelf_ledge: { targetHeight: 0.08, maxWidth: 1.6, maxDepth: 0.3 },
  jp_knit_pillow: { targetHeight: 0.32, maxWidth: 0.55, maxDepth: 0.55 },
  jp_rug_round: { targetHeight: 0.025, maxWidth: 2.0, maxDepth: 2.0 },
  jp_paper_lantern: { targetHeight: 0.7, maxWidth: 1.0, maxDepth: 1.0 },
  jp_art_py: { targetHeight: 0.55, maxWidth: 0.75, maxDepth: 0.1 },
  jp_art_wind: { targetHeight: 0.55, maxWidth: 0.75, maxDepth: 0.1 },
  jp_art_py2: { targetHeight: 0.55, maxWidth: 0.75, maxDepth: 0.1 },
  jp_art_wind2: { targetHeight: 0.55, maxWidth: 0.75, maxDepth: 0.1 },
  l6_sofa: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  l6_sofa_b: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  l6_dining: { targetHeight: 0.85, maxWidth: 2.2, maxDepth: 1.6 },
  l6_kitchen: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  l6_cabinet: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  l6_island: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l6_coffee_a: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l6_coffee_b: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l6_tray: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l6_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  l6_art_tall: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  l6_art: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  l2_chair: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  l2_coffee: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l2_side_table: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l2_plant: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  l2_bust: { targetHeight: 0.85, maxWidth: 0.7, maxDepth: 0.7 },
  l2_pedestal: { targetHeight: 0.85, maxWidth: 0.7, maxDepth: 0.7 },
  l2_art: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  l2_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  l2_pendant: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  l13_sofa: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  l13_chair_a: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  l13_chair_b: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  l13_chair_c: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  l13_ottoman: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  l13_table: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  l13_console: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  l13_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  l13_plant_a: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  l13_plant_b: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  l13_plant_c: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  l13_pot: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  l13_pillow_a: { targetHeight: 0.85, maxWidth: 0.7, maxDepth: 0.7 },
  l13_pillow_b: { targetHeight: 0.85, maxWidth: 0.7, maxDepth: 0.7 },
  l13_decor_small: { targetHeight: 0.85, maxWidth: 0.7, maxDepth: 0.7 },
  l13_art_carve: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  bed_platform: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  bed_egg_chair: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  bed_nightstand: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  bed_plant: { targetHeight: 1.15, maxWidth: 0.85, maxDepth: 0.85 },
  bed_pendant: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  bed_books: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  bed_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  bed_art_a: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  bed_art_b: { targetHeight: 0.85, maxWidth: 1, maxDepth: 0.35 },
  mini_sofa: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  mini_lounge: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  mini_table: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  mini_coffee: { targetHeight: 0.45, maxWidth: 1.4, maxDepth: 1.2 },
  mini_console: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  mini_shelf: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  mini_kitchen: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  mini_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  i9_bed: { targetHeight: 0.75, maxWidth: 2.3, maxDepth: 2.2 },
  i9_rack: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  i9_tire_rack: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  i9_rug: { targetHeight: 0.025, maxWidth: 2.2, maxDepth: 2.6 },
  shelf_1: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_2: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_3: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_4: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_5: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_6: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  shelf_7: { targetHeight: 1.8, maxWidth: 1.6, maxDepth: 0.9 },
  chair2_1: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  chair2_2: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  chair2_3: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  chair2_4: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  chair2_5: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  chair2_6: { targetHeight: 0.9, maxWidth: 1, maxDepth: 1.05 },
  clock_stand: { targetHeight: 1.85, maxWidth: 0.85, maxDepth: 0.7 },
  car_a: { targetHeight: 1.15, maxWidth: 2.0, maxDepth: 4.2 },
  car_b: { targetHeight: 1.35, maxWidth: 2.2, maxDepth: 4.5 },
  // Architecture — shrink huge walls/floors to ~human-readable showcase size
  arch_i9_slab: { targetHeight: 1.6, maxWidth: 2.4, maxDepth: 0.35 },
  arch_i9_floor: { targetHeight: 0.08, maxWidth: 2.4, maxDepth: 2.6 },
  arch_i9_wall: { targetHeight: 1.8, maxWidth: 0.35, maxDepth: 2.6 },
  arch_i9_windows: { targetHeight: 1.2, maxWidth: 2.6, maxDepth: 2.6 },
  arch_i9_wall_b: { targetHeight: 1.8, maxWidth: 2.4, maxDepth: 0.55 },
  arch_i9_garage_door: { targetHeight: 1.8, maxWidth: 2.4, maxDepth: 0.25 },
  arch_i9_wall_c: { targetHeight: 1.8, maxWidth: 0.35, maxDepth: 2.4 },
  arch_l6_beam: { targetHeight: 0.55, maxWidth: 1.2, maxDepth: 2.6 },
  arch_l6_ledge: { targetHeight: 0.08, maxWidth: 1.4, maxDepth: 2.6 },
  arch_l6_plank: { targetHeight: 0.06, maxWidth: 2.2, maxDepth: 1.2 },
  arch_l6_window: { targetHeight: 1.4, maxWidth: 2.2, maxDepth: 0.25 },
  arch_l6_pane: { targetHeight: 1.4, maxWidth: 1.0, maxDepth: 0.15 },
  arch_l2_beam: { targetHeight: 0.45, maxWidth: 2.6, maxDepth: 0.55 },
  arch_l2_ledge: { targetHeight: 0.35, maxWidth: 2.6, maxDepth: 0.25 },
  arch_l2_window: { targetHeight: 1.8, maxWidth: 2.6, maxDepth: 2.2 },
  arch_l2_window_b: { targetHeight: 1.8, maxWidth: 2.6, maxDepth: 1.6 },
  arch_l2_pipe: { targetHeight: 0.08, maxWidth: 0.15, maxDepth: 2.4 },
  arch_l2_stair: { targetHeight: 1.6, maxWidth: 2.4, maxDepth: 1.6 },
  arch_l13_beam: { targetHeight: 0.12, maxWidth: 2.4, maxDepth: 0.2 },
  arch_l13_ceiling: { targetHeight: 0.1, maxWidth: 2.4, maxDepth: 2.4 },
  arch_l13_plinth: { targetHeight: 0.12, maxWidth: 2.6, maxDepth: 2.2 },
  arch_bed_structure: { targetHeight: 1.8, maxWidth: 2.6, maxDepth: 2.6 },
  arch_bed_floor: { targetHeight: 0.04, maxWidth: 2.4, maxDepth: 2.4 },
  arch_bed_window: { targetHeight: 1.4, maxWidth: 0.15, maxDepth: 1.2 },
  arch_mini_shell: { targetHeight: 1.8, maxWidth: 2.6, maxDepth: 2.6 },
  arch_mini_window: { targetHeight: 1.2, maxWidth: 0.15, maxDepth: 1.1 },
  arch_jp_wall: { targetHeight: 1.8, maxWidth: 0.25, maxDepth: 2.6 },
  arch_jp_wall_b: { targetHeight: 1.8, maxWidth: 2.6, maxDepth: 0.25 },
  arch_jp_floor: { targetHeight: 0.04, maxWidth: 2.6, maxDepth: 2.6 },
  arch_jp_window: { targetHeight: 1.8, maxWidth: 2.4, maxDepth: 0.15 }
};

function fitFor(name) {
  if (FIT[name]) return FIT[name];
  if (name.startsWith('car_')) return { targetHeight: 1.2, maxWidth: 2.1, maxDepth: 4.3 };
  if (name.startsWith('arch_')) return { targetHeight: 1.6, maxWidth: 2.4, maxDepth: 2.4 };
  return null;
}

const ROOM = { width: 3.6, depth: 3.2, height: 2.75, wallT: 0.07 };

/** Pointer move (px²) before a press becomes a furniture drag. */
const DRAG_THRESH_SQ = 64;

/** Drag lift: scroll up (negative deltaY on Windows/macOS) → raise. */
const DRAG_Y_MIN = 0;
const DRAG_Y_MAX = 2.5;
/** Metres per wheel deltaY unit (≈0.2 m per typical 100-unit notch). */
const DRAG_Y_WHEEL_SCALE = 0.002;

/** World AABB around room + grass catalog — wheel cycle / LMB place only here. */
const STAGING_BOUNDS = { minX: 168, maxX: 228, minZ: -60, maxZ: 48 };

const UI_PICK_BLOCK =
  '#hud, button, .hud-panel, #terrain-debug-readout, #camera-mode-btn, #apt-staging-hud-wrap, #apt-staging-hud, #apt-staging-preview';

/** Live catalog thumbnail (offscreen RT → 2D canvas). */
const PREVIEW_PX = 88;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _floorPlane = new THREE.Plane();
const _hitPoint = new THREE.Vector3();
const _localHit = new THREE.Vector3();
const _floorNormal = new THREE.Vector3(0, 1, 0);
const _previewClear = new THREE.Color();
const _previewViewport = new THREE.Vector4();
const _previewCamPos = new THREE.Vector3();

function stdBasic(color, emissive, emissiveIntensity = 0.5) {
  const out = new THREE.Color(color).multiplyScalar(0.35);
  const e = new THREE.Color(emissive);
  out.r = Math.min(1, out.r + e.r * emissiveIntensity);
  out.g = Math.min(1, out.g + e.g * emissiveIntensity);
  out.b = Math.min(1, out.b + e.b * emissiveIntensity);
  return new THREE.MeshBasicMaterial({ color: out, toneMapped: true });
}

function basicFromLoft(src, cache) {
  const key =
    (src?.map?.uuid || 'nomap') +
    ':' +
    (src?.name || '') +
    ':' +
    (src?.color ? src.color.getHexString() : 'fff');
  if (cache.has(key)) return cache.get(key);
  const color = src?.color ? src.color.clone() : new THREE.Color(0xffffff);
  // Lift dark loft fabric (sofa) for outdoor MeshBasic readability.
  color.multiplyScalar(1.12);
  color.r = Math.min(1, color.r + 0.1);
  color.g = Math.min(1, color.g + 0.08);
  color.b = Math.min(1, color.b + 0.05);
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: src?.map || null,
    name: src?.name ? `aptEx-${src.name}` : 'aptEx-mat',
    // Loft GLB mats are DoubleSide; FrontSide + inverted tops → black pancake.
    side: THREE.DoubleSide,
    toneMapped: true
  });
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 2;
  }
  cache.set(key, mat);
  return mat;
}

/**
 * Detect up axis from AABB, rotate so it becomes +Y, floor to y=0, center XZ.
 * Chair/sofa: keep authored Y-up (sling depth can exceed height — never tallest→up).
 * Coffee/tray/rug: shortest → Y when clearly flat. Plant: tallest → Y if Y short.
 * Mutates `inner` in place (child of a pose Group).
 * @param {THREE.Object3D} inner
 * @param {string} [pieceName] loft piece id
 */
export function normalizePieceUpright(inner, pieceName = '') {
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.scale.set(1, 1, 1);
  inner.updateMatrixWorld(true);

  _box.setFromObject(inner);
  if (_box.isEmpty()) return inner;
  _box.getSize(_size);

  const sx = Math.max(_size.x, 1e-6);
  const sy = Math.max(_size.y, 1e-6);
  const sz = Math.max(_size.z, 1e-6);
  const dims = [
    { axis: 0, s: sx },
    { axis: 1, s: sy },
    { axis: 2, s: sz }
  ].sort((a, b) => a.s - b.s);

  let upAxis = 1;
  const name = pieceName || inner.name || '';
  if (name === 'chair' || name.startsWith('chair')) {
    // Leather sling (node_0.001): extract Rx(-90) already floors Y-up.
    // Authored depth often exceeds height (AABB ~[1.95, 1.86, 2.24]) — tallest→up
    // would Rx(-90) again and tip the chair onto its side. Keep authored Y.
    upAxis = 1;
  } else if (name === 'sofa' || name.startsWith('sofa')) {
    // Real sofa (node_0) AABB ~[4.49, 1.81, 5.57] floored Y-up after extract.
    upAxis = 1;
  } else if (
    name === 'rug' ||
    name.startsWith('rug') ||
    name === 'jp_rug_round' ||
    name.startsWith('jp_mat') ||
    name === 'jp_slat_mat'
  ) {
    // Flat plane / mat: shortest → up.
    upAxis = dims[0].axis;
  } else if (name === 'coffee' || name.startsWith('coffee') || name === 'tray' || name.startsWith('tray')) {
    // Thin tabletop / tray: shortest → up if clearly flat.
    if (dims[0].s < dims[1].s * 0.55) upAxis = dims[0].axis;
    else upAxis = 1;
  } else if (
    name === 'wallart' ||
    name.startsWith('wallart') ||
    name.startsWith('jp_art_') ||
    name === 'jp_moongate' ||
    name === 'jp_shelf_ledge'
  ) {
    // Canvas / shelf slab: keep authored Y-up (tall face).
    upAxis = 1;
  } else if (
    name === 'bar' ||
    name.startsWith('bar') ||
    name.startsWith('jp_') ||
    name.startsWith('car_') ||
    name.startsWith('arch_')
  ) {
    // Novopo extracts (JP / cars / arch) are already floored Y-up — never re-tip.
    upAxis = 1;
  } else if (sy < dims[2].s * 0.85 && (name === 'plant' || name.startsWith('plant'))) {
    upAxis = dims[2].axis;
  }
  // console / other: keep authored Y-up.

  if (upAxis === 0) {
    inner.rotation.z = Math.PI / 2; // +X → +Y
  } else if (upAxis === 2) {
    inner.rotation.x = -Math.PI / 2; // +Z → +Y
  }
  inner.updateMatrixWorld(true);

  _box.setFromObject(inner);
  if (!_box.isEmpty()) {
    _box.getCenter(_center);
    inner.position.x -= _center.x;
    inner.position.z -= _center.z;
    inner.position.y -= _box.min.y;
    inner.updateMatrixWorld(true);
  }
  return inner;
}

/**
 * @param {THREE.Object3D} obj
 * @param {{targetHeight:number,maxWidth?:number,maxDepth?:number}} fit
 */
function fitUniformScale(obj, fit) {
  _box.setFromObject(obj);
  _box.getSize(_size);
  const sx = Math.max(_size.x, 1e-4);
  const sy = Math.max(_size.y, 1e-4);
  const sz = Math.max(_size.z, 1e-4);
  return Math.min(
    fit.targetHeight / sy,
    (fit.maxWidth ?? fit.targetHeight * 2) / sx,
    (fit.maxDepth ?? fit.targetHeight * 2) / sz
  );
}

function buildShell() {
  const { width, depth, height, wallT } = ROOM;
  const g = new THREE.Group();
  g.name = 'apt-example-shell';

  const floorMat = stdBasic(0xa89070, 0x3a3020, 0.4);
  const ceilMat = stdBasic(0xfffaf3, 0xfff5e8, 0.55);
  const plaster = stdBasic(0xfff6ea, 0xffe8c8, 0.75);

  const addBox = (mat, w, h, d, x, y, z, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    g.add(m);
  };

  addBox(floorMat, width, wallT, depth, 0, wallT * 0.5, depth * 0.5, 'floor');
  addBox(ceilMat, width, wallT, depth, 0, height, depth * 0.5, 'ceiling');
  addBox(plaster, wallT, height, depth, -width * 0.5, height * 0.5, depth * 0.5, 'wall-x-');
  addBox(plaster, wallT, height, depth, width * 0.5, height * 0.5, depth * 0.5, 'wall-x+');
  addBox(plaster, width, height, wallT, 0, height * 0.5, depth, 'wall-back');
  // Open face at z≈0 (no front wall) — street looks +Z into the room.

  return g;
}

/**
 * Build pose Group → upright inner (MeshBasic loft clone).
 * @param {THREE.Object3D|Map<string, THREE.Object3D>} loftRootOrMap
 * @param {string} name
 * @param {Map<string, THREE.MeshBasicMaterial>} matCache
 * @returns {THREE.Group|null}
 */
function extractPiece(loftRootOrMap, name, matCache) {
  let src = null;
  if (loftRootOrMap instanceof Map) {
    src = loftRootOrMap.get(name) || null;
  } else if (loftRootOrMap) {
    loftRootOrMap.traverse((o) => {
      if (o.name === name) src = o;
    });
  }
  if (!src) {
    console.warn('[apt-example] loft piece missing', name);
    return null;
  }

  const inner = src.clone(true);
  inner.name = `${name}-mesh`;
  inner.traverse((c) => {
    if (!c.isMesh) return;
    const srcMats = Array.isArray(c.material) ? c.material : [c.material];
    const next = srcMats.map((m) => basicFromLoft(m, matCache));
    c.material = Array.isArray(c.material) ? next : next[0];
    c.castShadow = false;
    c.receiveShadow = false;
    c.frustumCulled = false;
  });

  normalizePieceUpright(inner, name);

  const pose = new THREE.Group();
  pose.name = name;
  pose.add(inner);

  const fit = fitFor(name);
  const fitScale = fit ? fitUniformScale(pose, fit) : 1;
  // Scale the pose group uniformly; re-floor inner after so feet stay on y=0.
  pose.scale.setScalar(fitScale);
  pose.updateMatrixWorld(true);
  _box.setFromObject(pose);
  if (!_box.isEmpty()) {
    // Compensate floor in unscaled parent space: move inner in pose-local.
    inner.position.y -= _box.min.y / fitScale;
  }

  pose.userData.aptExampleFitScale = fitScale;
  pose.userData.aptExamplePose = { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
  pose.userData.aptCatalogName = name;
  return pose;
}

function addCoffeeLegs(parent, layout) {
  const mat = stdBasic(0x2a2a2a, 0x101010, 0.35);
  const leg = 0.04;
  const legH = 0.18;
  const span = 0.28;
  for (const [dx, dz] of [
    [-span, -span],
    [span, -span],
    [-span, span],
    [span, span]
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(leg, legH, leg), mat);
    m.name = 'coffee-leg';
    m.position.set(layout.x + dx, legH * 0.5, layout.z + dz);
    m.frustumCulled = false;
    parent.add(m);
  }
}

function clearCoffeeLegs(parent) {
  const doomed = [];
  parent.traverse((c) => {
    if (c.name === 'coffee-leg') doomed.push(c);
  });
  for (const m of doomed) m.parent?.remove(m);
}

function applyPose(poseGroup, next) {
  const fit = poseGroup.userData.aptExampleFitScale || 1;
  poseGroup.position.set(next.x, next.y, next.z);
  poseGroup.rotation.set(0, next.yaw, 0);
  poseGroup.scale.setScalar(fit * next.scale);
  poseGroup.userData.aptExamplePose = { ...next };
  // Snap feet to floor when y is the default floor contact.
  if (next.y === 0) {
    poseGroup.updateMatrixWorld(true);
    _box.setFromObject(poseGroup);
    if (!_box.isEmpty()) {
      poseGroup.position.y -= _box.min.y;
      next.y = poseGroup.position.y;
      poseGroup.userData.aptExamplePose.y = next.y;
    }
  }
}

/** Floating label sprite above a catalog sample. */
function makeLabelSprite(text) {
  const w = 256;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.beginPath();
  // roundRect may be missing in older engines — manual path
  const r = 12;
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
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#ecfdf5';
  ctx.font = text.length > 12 ? 'bold 24px system-ui, sans-serif' : 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
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
  // Compact labels for dense multi-pack grass grid
  const labelW = Math.min(1.55, 0.55 + text.length * 0.07);
  spr.scale.set(labelW, 0.32, 1);
  spr.position.y = 1.25;
  spr.renderOrder = 1000;
  spr.frustumCulled = false;
  spr.name = `label-${text}`;
  spr.userData.aptCatalogName = text;
  return spr;
}

function clampRoomXZ(x, z) {
  const margin = 0.35;
  const halfW = ROOM.width * 0.5 - margin;
  return {
    x: Math.max(-halfW, Math.min(halfW, x)),
    z: Math.max(margin, Math.min(ROOM.depth - margin, z))
  };
}

/**
 * @param {THREE.Object3D} parent
 * @param {Partial<typeof APT_EXAMPLE_DEFAULT> & {
 *   camera?: THREE.Camera,
 *   domElement?: HTMLElement,
 *   lookControls?: { setLookBlocked?: (b: boolean) => void },
 *   mouseInput?: { setDragBlocked?: (b: boolean) => void, enabled?: boolean },
 *   glRenderer?: THREE.WebGLRenderer
 * }} [opts]
 */
export async function spawnAptExampleSandbox(parent, opts = {}) {
  const cfg = { ...APT_EXAMPLE_DEFAULT, ...opts };
  const root = new THREE.Group();
  root.name = 'apt-example-sandbox';
  root.position.set(cfg.x, cfg.y, cfg.z);
  root.rotation.y = cfg.yaw;

  const roomGroup = new THREE.Group();
  roomGroup.name = 'apt-example-room';
  roomGroup.add(buildShell());
  root.add(roomGroup);

  /** Street catalog lives in world space (sibling of room root orientation). */
  const catalogGroup = new THREE.Group();
  catalogGroup.name = 'apt-example-catalog';
  parent.add(catalogGroup);

  /** @type {Record<string, THREE.Object3D>} */
  const pieces = {};
  /** @type {Record<string, THREE.Object3D>} */
  const catalog = {};
  const matCache = new Map();
  /** name → source Object3D from loft or novopo GLB */
  /** @type {Map<string, THREE.Object3D>} */
  const pieceSource = new Map();
  /** @type {THREE.Object3D|null} */
  let loftRoot = null;

  function indexPieces(root, names) {
    if (!root) return;
    const want = new Set(names);
    root.traverse((o) => {
      if (want.has(o.name) && !pieceSource.has(o.name)) pieceSource.set(o.name, o);
    });
  }

  loftRoot = await loadGltf(LOFT_URL);
  indexPieces(loftRoot, LOFT_CATALOG_NAMES);
  const novopoRoot = await loadGltf(NOVOPO_URL);
  indexPieces(novopoRoot, NOVOPO_CATALOG_NAMES);
  const extrasRoot = await loadGltf(NOVOPO_EXTRAS);
  indexPieces(extrasRoot, [...CAR_CATALOG_NAMES, ...ARCH_CATALOG_NAMES]);
  // Keep loftRoot truthy if any kit loaded (addFromCatalog gate).
  if (!loftRoot && (novopoRoot || extrasRoot)) loftRoot = novopoRoot || extrasRoot;

  /**
   * Place named samples on grass in a zone; returns next z0 (north of last row + gap).
   * @param {string[]} names
   * @param {{x0:number,z0:number,dx:number,dz:number,cols:number,gapRows?:number}} zone
   */
  function placeZone(names, zone) {
    let lastRow = -1;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const sample = extractPiece(pieceSource, name, matCache);
      if (!sample) continue;
      sample.name = `catalog-${name}`;
      sample.userData.aptCatalogName = name;
      sample.userData.aptIsCatalog = true;
      const col = i % zone.cols;
      const row = Math.floor(i / zone.cols);
      lastRow = row;
      const wx = zone.x0 + col * zone.dx;
      const wz = zone.z0 + row * zone.dz;
      sample.position.set(wx, CATALOG_Y, wz);
      sample.rotation.y = CATALOG_YAW;
      sample.updateMatrixWorld(true);
      _box.setFromObject(sample);
      if (!_box.isEmpty()) {
        sample.position.y -= _box.min.y - CATALOG_Y;
      }
      sample.add(makeLabelSprite(name));
      catalogGroup.add(sample);
      catalog[name] = sample;
    }
    const rowsUsed = Math.max(0, lastRow + 1);
    const gap = zone.gapRows ?? 0;
    return zone.z0 + (rowsUsed + gap) * zone.dz;
  }

  if (pieceSource.size) {
    const furnNames = [...LOFT_CATALOG_NAMES, ...NOVOPO_CATALOG_NAMES];
    let nextZ = placeZone(furnNames, CATALOG_ZONE.furniture);
    nextZ = placeZone(CAR_CATALOG_NAMES, { ...CATALOG_ZONE.cars, z0: nextZ });
    placeZone(ARCH_CATALOG_NAMES, { ...CATALOG_ZONE.architecture, z0: nextZ });
  } else {
    console.warn('[apt-example] furniture/extras GLBs failed — shell only');
  }

  parent.add(root);

  /** World-space placements (grass/asphalt) outside the shell. */
  const worldGroup = new THREE.Group();
  worldGroup.name = 'apt-example-world-placed';
  parent.add(worldGroup);

  const layout = {};
  /** @type {Record<string, THREE.Object3D>} */
  const worldPieces = {};
  let worldSeq = 0;

  /** Catalog names that actually spawned on grass (cycle order). */
  const cycleNames = CATALOG_NAMES.filter((n) => catalog[n]);
  let selectedIndex = cycleNames.length ? 0 : -1;
  /** @type {THREE.Object3D|null} */
  let selectRing = null;
  /** @type {'catalog'|'room'|'world'|null} */
  let gizmoTargetKind = null;
  /** @type {string|null} */
  let gizmoTargetName = null;

  const api = {
    root,
    roomGroup,
    catalogGroup,
    worldGroup,
    pieces,
    worldPieces,
    catalog,
    layout,
    catalogNames: [...CATALOG_NAMES],
    get selectedIndex() {
      return selectedIndex;
    },
    get selectedName() {
      return selectedIndex >= 0 ? cycleNames[selectedIndex] || null : null;
    },
    get gizmoMode() {
      return transformControls?.mode || 'translate';
    },
    where:
      'Asphalt corner SE of Large_3@171,30 — room ~x=182,z=22 open south; grass catalog east (~x=188+). Staging: wheel cycles catalog incl. (nenhum); HUD live thumbnail; LMB ground places selected (noop if nenhum); RMB pan; Esc=nenhum; W/E/R or 1/2/3 gizmo; drag catalog→room + in-room slide; wheel while drag = height.',
    facadeId: cfg.facadeId,
    /**
     * Clone a loft piece into the empty room at its default slot (or override).
     * Replaces any existing piece of the same name.
     * @param {string} name
     * @param {{x?:number,y?:number,z?:number,yaw?:number,scale?:number}} [pose]
     */
    addFromCatalog(name, pose = {}) {
      if (!pieceSource.size) {
        console.warn('[apt-example] no furniture sources — cannot add', name);
        return false;
      }
      if (!DEFAULT_SLOTS[name] && !CATALOG_NAMES.includes(name)) {
        console.warn('[apt-example] unknown catalog piece', name);
        return false;
      }
      // Remove prior instance of same name.
      if (pieces[name]) {
        if (gizmoTargetKind === 'room' && gizmoTargetName === name) detachGizmo();
        roomGroup.remove(pieces[name]);
        delete pieces[name];
        delete layout[name];
        if (name === 'coffee') clearCoffeeLegs(roomGroup);
      }
      const piece = extractPiece(pieceSource, name, matCache);
      if (!piece) return false;
      piece.userData.aptIsCatalog = false;
      piece.userData.aptInRoom = true;
      piece.userData.aptInWorld = false;
      const slot = { ...(DEFAULT_SLOTS[name] || { x: 0, y: 0, z: 1.2, yaw: 0, scale: 1 }), ...pose };
      applyPose(piece, slot);
      roomGroup.add(piece);
      pieces[name] = piece;
      layout[name] = { ...piece.userData.aptExamplePose };
      console.info('[apt-example] added', name, layout[name]);
      return true;
    },
    /**
     * Place selected (or named) piece at world xz. Over shell floor → room local;
     * else into worldGroup with feet floored to ground Y.
     * @param {number} worldX
     * @param {number} worldZ
     * @param {string} [name]
     */
    placeAtGround(worldX, worldZ, name) {
      const n = name || api.selectedName;
      if (!n) return false;
      roomGroup.updateMatrixWorld(true);
      _localHit.set(worldX, CATALOG_Y, worldZ);
      roomGroup.worldToLocal(_localHit);
      const inRoom =
        _localHit.x >= -ROOM.width * 0.55 &&
        _localHit.x <= ROOM.width * 0.55 &&
        _localHit.z >= -0.35 &&
        _localHit.z <= ROOM.depth + 0.2;
      if (inRoom) {
        const xz = clampRoomXZ(_localHit.x, _localHit.z);
        const slot = DEFAULT_SLOTS[n] || { yaw: 0, scale: 1 };
        const ok = api.addFromCatalog(n, {
          x: xz.x,
          y: 0,
          z: xz.z,
          yaw: slot.yaw ?? 0,
          scale: slot.scale ?? 1
        });
        if (ok) selectPlaced('room', n);
        return ok;
      }
      return api.addToWorld(n, worldX, worldZ);
    },
    /**
     * @param {string} name
     * @param {number} worldX
     * @param {number} worldZ
     * @param {{yaw?:number,scale?:number}} [pose]
     */
    addToWorld(name, worldX, worldZ, pose = {}) {
      if (!pieceSource.size) return false;
      if (!CATALOG_NAMES.includes(name) && !DEFAULT_SLOTS[name]) {
        console.warn('[apt-example] unknown catalog piece', name);
        return false;
      }
      const piece = extractPiece(pieceSource, name, matCache);
      if (!piece) return false;
      const id = `${name}#${++worldSeq}`;
      piece.name = id;
      piece.userData.aptIsCatalog = false;
      piece.userData.aptInRoom = false;
      piece.userData.aptInWorld = true;
      piece.userData.aptCatalogName = name;
      piece.userData.aptWorldId = id;
      const yaw = pose.yaw ?? (DEFAULT_SLOTS[name]?.yaw ?? CATALOG_YAW);
      const scale = pose.scale ?? 1;
      applyPose(piece, { x: worldX, y: 0, z: worldZ, yaw, scale });
      // applyPose floors relative to parent; ensure world Y after add.
      worldGroup.add(piece);
      piece.updateMatrixWorld(true);
      _box.setFromObject(piece);
      if (!_box.isEmpty()) {
        piece.position.y -= _box.min.y - CATALOG_Y;
        if (piece.userData.aptExamplePose) piece.userData.aptExamplePose.y = piece.position.y;
      }
      worldPieces[id] = piece;
      console.info('[apt-example] world place', id, worldX.toFixed(2), worldZ.toFixed(2));
      selectPlaced('world', id);
      return true;
    },
    /**
     * Nudge one in-room piece. y=0 keeps feet on floor; y>0 is lift (metres).
     * yaw in radians.
     * @param {string} name
     * @param {{x?:number,y?:number,z?:number,yaw?:number,scale?:number}} pose
     */
    setPose(name, pose = {}) {
      const p = pieces[name];
      if (!p) return false;
      const cur = p.userData.aptExamplePose || { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
      const next = {
        x: pose.x ?? cur.x,
        y: pose.y ?? 0,
        z: pose.z ?? cur.z,
        yaw: pose.yaw ?? cur.yaw,
        scale: pose.scale ?? cur.scale
      };
      applyPose(p, next);
      layout[name] = { ...p.userData.aptExamplePose };
      return true;
    },
    getPose(name) {
      const p = pieces[name];
      if (!p) return null;
      return { ...(p.userData.aptExamplePose || {}) };
    },
    /** Remove all furniture from the room (catalog stays on the street). */
    clearRoom() {
      if (gizmoTargetKind === 'room') detachGizmo();
      for (const name of Object.keys(pieces)) {
        roomGroup.remove(pieces[name]);
        delete pieces[name];
        delete layout[name];
      }
      clearCoffeeLegs(roomGroup);
      return true;
    },
    clearWorld() {
      if (gizmoTargetKind === 'world') detachGizmo();
      for (const id of Object.keys(worldPieces)) {
        worldGroup.remove(worldPieces[id]);
        delete worldPieces[id];
      }
      return true;
    },
    setSelectedIndex(i) {
      setCatalogSelection(i);
    },
    setGizmoMode(mode) {
      setGizmoMode(mode);
    },
    getPoseRoom() {
      return { x: cfg.x, y: cfg.y, z: cfg.z, yaw: cfg.yaw };
    }
  };

  // ── Staging HUD + TransformControls + pointer ──
  const camera = opts.camera || null;
  const dom = opts.domElement || null;
  const lookControls = opts.lookControls || null;
  const mouseInput = opts.mouseInput || null;

  /** @type {TransformControls|null} */
  let transformControls = null;
  /** @type {THREE.Object3D|null} */
  let transformHelper = null;
  let gizmoDragging = false;

  /** @type {null | { kind:'catalog'|'room'|'world', name:string, downX:number, downY:number, dragging:boolean, yaw:number, liftY:number }} */
  let gesture = null;
  /** @type {THREE.Object3D|null} ghost preview while dragging from catalog */
  let ghost = null;

  /** @type {HTMLElement|null} */
  let hudEl = null;
  /** @type {HTMLElement|null} */
  let hudWrap = null;
  /** @type {HTMLCanvasElement|null} */
  let previewCanvas = null;
  /** @type {CanvasRenderingContext2D|null} */
  let previewCtx = null;
  /** @type {THREE.WebGLRenderer|null} */
  const glRenderer = opts.glRenderer || null;
  /** @type {THREE.WebGLRenderTarget|null} */
  let previewRT = null;
  /** @type {THREE.Scene|null} */
  let previewScene = null;
  /** @type {THREE.PerspectiveCamera|null} */
  let previewCam = null;
  /** @type {Uint8Array|null} */
  let previewPixels = null;
  /** @type {ImageData|null} */
  let previewImage = null;
  let previewRaf = 0;
  let previewName = null;

  function setLookBlocked(blocked) {
    lookControls?.setLookBlocked?.(blocked);
    mouseInput?.setDragBlocked?.(blocked);
  }

  function clampDragY(y) {
    return Math.max(DRAG_Y_MIN, Math.min(DRAG_Y_MAX, y));
  }

  /** y=0 → floor-snap path in applyPose; else absolute lift. */
  function poseYFromLift(liftY) {
    const y = clampDragY(liftY);
    return y <= 1e-4 ? 0 : y;
  }

  function ensureSelectRing() {
    if (selectRing) return selectRing;
    const geo = new THREE.RingGeometry(0.42, 0.58, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      side: THREE.DoubleSide,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      toneMapped: false
    });
    selectRing = new THREE.Mesh(geo, mat);
    selectRing.name = 'apt-catalog-select-ring';
    selectRing.rotation.x = -Math.PI / 2;
    selectRing.renderOrder = 10;
    return selectRing;
  }

  function clearCatalogHighlight() {
    if (selectRing?.parent) selectRing.parent.remove(selectRing);
    for (const name of cycleNames) {
      const s = catalog[name];
      if (!s?.userData) continue;
      if (s.userData._aptSelScale != null) {
        s.scale.setScalar(s.userData._aptSelScale);
        delete s.userData._aptSelScale;
      }
    }
  }

  function ensurePreviewPipeline() {
    if (!glRenderer || !previewCanvas) return false;
    if (previewRT) return true;
    previewRT = new THREE.WebGLRenderTarget(PREVIEW_PX, PREVIEW_PX, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.SRGBColorSpace
    });
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x0f172a);
    previewCam = new THREE.PerspectiveCamera(32, 1, 0.05, 80);
    previewPixels = new Uint8Array(PREVIEW_PX * PREVIEW_PX * 4);
    previewImage = previewCtx.createImageData(PREVIEW_PX, PREVIEW_PX);
    return true;
  }

  function paintPreviewPlaceholder() {
    if (!previewCtx || !previewCanvas) return;
    previewCtx.fillStyle = '#0f172a';
    previewCtx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    previewCtx.strokeStyle = '#334155';
    previewCtx.strokeRect(0.5, 0.5, PREVIEW_PX - 1, PREVIEW_PX - 1);
    previewCtx.fillStyle = '#64748b';
    previewCtx.font = '22px system-ui,sans-serif';
    previewCtx.textAlign = 'center';
    previewCtx.textBaseline = 'middle';
    previewCtx.fillText('—', PREVIEW_PX / 2, PREVIEW_PX / 2);
    previewCanvas.classList.add('is-empty');
    previewCanvas.title = '(nenhum)';
  }

  function disposePreviewPipeline() {
    if (previewRaf) {
      cancelAnimationFrame(previewRaf);
      previewRaf = 0;
    }
    if (previewRT) {
      previewRT.dispose();
      previewRT = null;
    }
    previewScene = null;
    previewCam = null;
    previewPixels = null;
    previewImage = null;
    previewName = null;
  }

  /**
   * One-shot offscreen render of the catalog sample into the HUD canvas.
   * Reuses a single RT; clones share geo/mats (do not dispose them).
   * @param {string|null} name
   * @param {THREE.Object3D|null} sample
   */
  function renderCatalogPreview(name, sample) {
    if (!previewCtx) return;
    if (!name || !sample) {
      previewName = null;
      paintPreviewPlaceholder();
      return;
    }
    if (!ensurePreviewPipeline()) {
      paintPreviewPlaceholder();
      return;
    }
    previewName = name;
    previewCanvas.classList.remove('is-empty');
    previewCanvas.title = name;

    const holder = new THREE.Group();
    const clone = sample.clone(true);
    const doomed = [];
    clone.traverse((o) => {
      if (o.name === 'apt-catalog-select-ring' || (typeof o.name === 'string' && o.name.startsWith('label-'))) {
        doomed.push(o);
      }
    });
    for (const o of doomed) o.parent?.remove(o);
    const baseScale =
      sample.userData._aptSelScale != null ? sample.userData._aptSelScale : sample.scale.x || 1;
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, Math.PI * 0.22, 0);
    clone.scale.setScalar(baseScale);
    holder.add(clone);
    holder.updateMatrixWorld(true);
    _box.setFromObject(holder);
    if (_box.isEmpty()) {
      paintPreviewPlaceholder();
      return;
    }
    _box.getCenter(_center);
    _box.getSize(_size);
    clone.position.x -= _center.x;
    clone.position.y -= _center.y;
    clone.position.z -= _center.z;
    holder.updateMatrixWorld(true);
    _box.setFromObject(holder);
    _box.getSize(_size);
    const maxDim = Math.max(_size.x, _size.y, _size.z, 0.05);
    const dist = maxDim * 1.65;
    _previewCamPos.set(dist * 0.85, dist * 0.55, dist);
    previewCam.position.copy(_previewCamPos);
    previewCam.near = Math.max(0.02, dist / 80);
    previewCam.far = Math.max(40, dist * 8);
    previewCam.lookAt(0, 0, 0);
    previewCam.updateProjectionMatrix();

    previewScene.clear();
    previewScene.background = new THREE.Color(0x0f172a);
    previewScene.add(holder);

    const prevTarget = glRenderer.getRenderTarget();
    const prevAutoClear = glRenderer.autoClear;
    glRenderer.getClearColor(_previewClear);
    const prevAlpha = glRenderer.getClearAlpha();
    glRenderer.getViewport(_previewViewport);
    const prevTone = glRenderer.toneMappingExposure;

    glRenderer.setRenderTarget(previewRT);
    glRenderer.setClearColor(0x0f172a, 1);
    glRenderer.autoClear = true;
    glRenderer.clear();
    glRenderer.render(previewScene, previewCam);
    glRenderer.setRenderTarget(prevTarget);
    glRenderer.setClearColor(_previewClear, prevAlpha);
    glRenderer.autoClear = prevAutoClear;
    glRenderer.setViewport(_previewViewport);
    glRenderer.toneMappingExposure = prevTone;

    glRenderer.readRenderTargetPixels(previewRT, 0, 0, PREVIEW_PX, PREVIEW_PX, previewPixels);
    const dst = previewImage.data;
    const row = PREVIEW_PX * 4;
    for (let y = 0; y < PREVIEW_PX; y++) {
      const srcOff = (PREVIEW_PX - 1 - y) * row;
      dst.set(previewPixels.subarray(srcOff, srcOff + row), y * row);
    }
    previewCtx.putImageData(previewImage, 0, 0);

    previewScene.remove(holder);
  }

  /** Queue one-shot preview refresh (coalesce rapid wheel steps). */
  function refreshPreview(name, sample) {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    if (!name || !sample) {
      previewRaf = 0;
      renderCatalogPreview(null, null);
      return;
    }
    previewRaf = requestAnimationFrame(() => {
      previewRaf = 0;
      renderCatalogPreview(name, sample);
    });
  }

  function updateHud() {
    if (!hudEl) return;
    const total = cycleNames.length || 0;
    const mode = transformControls?.mode || 'translate';
    const tgt =
      gizmoTargetKind && gizmoTargetName
        ? `${gizmoTargetKind}:${gizmoTargetName}`
        : 'nenhum';
    if (selectedIndex < 0 || !api.selectedName) {
      hudEl.textContent = `Catálogo [—/${total}]: (nenhum)  ·  Gizmo: ${mode} (${tgt})  ·  Esc=nenhum  ·  scroll=ciclo  ·  LMB chão=colocar  ·  RMB=pan`;
    } else {
      hudEl.textContent = `Catálogo [${selectedIndex + 1}/${total}]: ${api.selectedName}  ·  Gizmo: ${mode} (${tgt})  ·  1/2/3 ou Alt+W/E/R  ·  scroll=ciclo  ·  LMB chão=colocar  ·  RMB=pan`;
    }
  }

  /**
   * Select catalog index, or -1 / length for (nenhum).
   * Wheel uses {@link cycleCatalog} so wrapping includes the nenhum slot.
   * @param {number} index
   */
  function setCatalogSelection(index) {
    if (!cycleNames.length) {
      selectedIndex = -1;
      clearCatalogHighlight();
      if (gizmoTargetKind === 'catalog') detachGizmo();
      updateHud();
      refreshPreview(null, null);
      return;
    }
    const len = cycleNames.length;
    // Sentinel: explicit none (also accept len as virtual slot).
    if (index === -1 || index === len) {
      selectedIndex = -1;
      clearCatalogHighlight();
      if (gizmoTargetKind === 'catalog') detachGizmo();
      updateHud();
      refreshPreview(null, null);
      return;
    }
    selectedIndex = ((index % len) + len) % len;
    clearCatalogHighlight();
    const name = cycleNames[selectedIndex];
    const sample = catalog[name];
    if (sample) {
      const ring = ensureSelectRing();
      sample.add(ring);
      // Ring in sample local space at feet.
      ring.position.set(0, 0.03, 0);
      if (sample.userData._aptSelScale == null) {
        sample.userData._aptSelScale = sample.scale.x || 1;
      }
      sample.scale.setScalar(sample.userData._aptSelScale * 1.06);
      // Showcase selection also drives the gizmo when not editing a placed piece.
      if (gizmoTargetKind !== 'room' && gizmoTargetKind !== 'world') {
        attachGizmo(sample, 'catalog', name);
      }
    }
    updateHud();
    refreshPreview(name, sample || null);
  }

  /** Wheel step across items + trailing (nenhum) sentinel. */
  function cycleCatalog(dir) {
    const len = cycleNames.length;
    if (!len) return;
    const span = len + 1;
    const cur = selectedIndex < 0 ? len : selectedIndex;
    const next = (((cur + dir) % span) + span) % span;
    setCatalogSelection(next === len ? -1 : next);
  }

  function syncPoseFromObject(obj, kind, name) {
    if (!obj) return;
    const fit = obj.userData.aptExampleFitScale || 1;
    const scl = fit > 1e-6 ? obj.scale.x / fit : 1;
    const pose = {
      x: obj.position.x,
      y: obj.position.y,
      z: obj.position.z,
      yaw: obj.rotation.y,
      scale: scl
    };
    obj.userData.aptExamplePose = { ...pose };
    if (kind === 'room' && layout[name] != null) {
      layout[name] = { ...pose };
    }
  }

  function detachGizmo() {
    if (transformControls) {
      transformControls.detach();
    }
    gizmoTargetKind = null;
    gizmoTargetName = null;
    updateHud();
  }

  function attachGizmo(obj, kind, name) {
    if (!transformControls || !obj) return;
    transformControls.attach(obj);
    gizmoTargetKind = kind;
    gizmoTargetName = name;
    updateHud();
  }

  function selectPlaced(kind, name) {
    let obj = null;
    if (kind === 'room') obj = pieces[name];
    else if (kind === 'world') obj = worldPieces[name];
    else if (kind === 'catalog') obj = catalog[name];
    if (!obj) return;
    // Keep catalog index in sync when picking a showcase sample.
    if (kind === 'catalog') {
      const idx = cycleNames.indexOf(name);
      if (idx >= 0) {
        gizmoTargetKind = null; // allow setCatalogSelection to attach
        setCatalogSelection(idx);
        return;
      }
    }
    attachGizmo(obj, kind, name);
  }

  function setGizmoMode(mode) {
    if (!transformControls) return;
    if (mode !== 'translate' && mode !== 'rotate' && mode !== 'scale') return;
    transformControls.setMode(mode);
    updateHud();
  }

  function applyDragPose(name, kind, local) {
    if (!local) return;
    const y = poseYFromLift(gesture.liftY);
    if (kind === 'catalog') {
      const g = ensureGhost(name);
      if (!g) return;
      applyPose(g, { x: local.x, y, z: local.z, yaw: gesture.yaw, scale: 1 });
      return;
    }
    if (kind === 'room') {
      api.setPose(name, { x: local.x, y, z: local.z, yaw: gesture.yaw });
      return;
    }
    // world drag on ground plane — local is world xz here
    const p = worldPieces[name];
    if (!p) return;
    applyPose(p, {
      x: local.x,
      y: y <= 1e-4 ? 0 : y,
      z: local.z,
      yaw: gesture.yaw,
      scale: p.userData.aptExamplePose?.scale ?? 1
    });
    if (y <= 1e-4) {
      p.updateMatrixWorld(true);
      _box.setFromObject(p);
      if (!_box.isEmpty()) {
        p.position.y -= _box.min.y - CATALOG_Y;
        if (p.userData.aptExamplePose) p.userData.aptExamplePose.y = p.position.y;
      }
    }
  }

  function disposeGhost() {
    if (!ghost) return;
    roomGroup.remove(ghost);
    ghost = null;
  }

  function catalogNameFromHit(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.aptCatalogName && o.userData?.aptIsCatalog) {
        return o.userData.aptCatalogName;
      }
      if (o.userData?.aptCatalogName && catalog[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (typeof o.name === 'string' && o.name.startsWith('catalog-')) {
        return o.name.slice('catalog-'.length);
      }
      if (typeof o.name === 'string' && o.name.startsWith('label-')) {
        return o.name.slice('label-'.length);
      }
      o = o.parent;
    }
    return null;
  }

  function roomPieceNameFromHit(obj) {
    let o = obj;
    while (o && o !== roomGroup) {
      if (o.userData?.aptInRoom && o.userData?.aptCatalogName && pieces[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (o.userData?.aptCatalogName && !o.userData?.aptIsCatalog && pieces[o.userData.aptCatalogName] === o) {
        return o.userData.aptCatalogName;
      }
      if (typeof o.name === 'string' && pieces[o.name] === o) return o.name;
      o = o.parent;
    }
    return null;
  }

  function worldPieceIdFromHit(obj) {
    let o = obj;
    while (o && o !== worldGroup) {
      if (o.userData?.aptInWorld && o.userData?.aptWorldId && worldPieces[o.userData.aptWorldId] === o) {
        return o.userData.aptWorldId;
      }
      if (typeof o.name === 'string' && worldPieces[o.name] === o) return o.name;
      o = o.parent;
    }
    return null;
  }

  function eventToNdc(ev) {
    const rect = (dom || ev.target)?.getBoundingClientRect?.() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function inStagingXZ(x, z) {
    return (
      x >= STAGING_BOUNDS.minX &&
      x <= STAGING_BOUNDS.maxX &&
      z >= STAGING_BOUNDS.minZ &&
      z <= STAGING_BOUNDS.maxZ
    );
  }

  /** Ray → y=CATALOG_Y ground plane world hit, or null. */
  function rayGroundWorld() {
    if (!camera) return null;
    _floorNormal.set(0, 1, 0);
    _floorPlane.setFromNormalAndCoplanarPoint(_floorNormal, new THREE.Vector3(0, CATALOG_Y, 0));
    if (!_raycaster.ray.intersectPlane(_floorPlane, _hitPoint)) return null;
    return { x: _hitPoint.x, y: CATALOG_Y, z: _hitPoint.z };
  }

  /** True when pointer ray hits catalog/room/world piece or staging ground. */
  function pointerOverStaging(ev) {
    if (!camera) return false;
    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);
    if (_raycaster.intersectObjects(catalogGroup.children, true).length) return true;
    if (_raycaster.intersectObjects(roomGroup.children, true).length) return true;
    if (_raycaster.intersectObjects(worldGroup.children, true).length) return true;
    const g = rayGroundWorld();
    return !!(g && inStagingXZ(g.x, g.z));
  }

  /** Ray → room-local floor xz, or null if miss / outside. */
  function rayRoomFloorLocal() {
    if (!camera) return null;
    // Floor plane through room local y=0 (feet), in world space.
    roomGroup.updateMatrixWorld(true);
    const worldOrigin = roomGroup.localToWorld(new THREE.Vector3(0, 0, ROOM.depth * 0.5));
    _floorNormal.set(0, 1, 0).transformDirection(roomGroup.matrixWorld).normalize();
    _floorPlane.setFromNormalAndCoplanarPoint(_floorNormal, worldOrigin);
    if (!_raycaster.ray.intersectPlane(_floorPlane, _hitPoint)) return null;
    _localHit.copy(_hitPoint);
    roomGroup.worldToLocal(_localHit);
    // Accept hits roughly over the footprint (slightly past open face for drops).
    if (_localHit.x < -ROOM.width * 0.55 || _localHit.x > ROOM.width * 0.55) return null;
    if (_localHit.z < -0.35 || _localHit.z > ROOM.depth + 0.2) return null;
    return clampRoomXZ(_localHit.x, _localHit.z);
  }

  function ensureGhost(name) {
    if (ghost && ghost.userData.aptCatalogName === name) return ghost;
    disposeGhost();
    if (!pieceSource.size) return null;
    ghost = extractPiece(pieceSource, name, matCache);
    if (!ghost) return null;
    ghost.userData.aptIsCatalog = false;
    ghost.userData.aptGhost = true;
    // Clone mats so opacity does not dirty the shared loft cache / catalog.
    ghost.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const srcMats = Array.isArray(c.material) ? c.material : [c.material];
      const next = srcMats.map((m) => {
        const cm = m.clone();
        cm.transparent = true;
        cm.opacity = 0.72;
        cm.depthWrite = false;
        return cm;
      });
      c.material = Array.isArray(c.material) ? next : next[0];
    });
    roomGroup.add(ghost);
    return ghost;
  }

  function isGizmoHit() {
    return !!(transformControls && (transformControls.axis || transformControls.dragging || gizmoDragging));
  }

  function onPointerDown(ev) {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target?.closest?.(UI_PICK_BLOCK)) return;
    if (!camera) return;

    // Let TransformControls own the gesture when a handle is under the cursor.
    if (isGizmoHit()) {
      setLookBlocked(true);
      return;
    }

    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);

    // Prefer in-room piece, then world-placed, then catalog.
    const roomHits = _raycaster.intersectObjects(roomGroup.children, true);
    for (const hit of roomHits) {
      if (hit.object?.userData?.aptGhost) continue;
      const name = roomPieceNameFromHit(hit.object);
      if (name) {
        const cur = pieces[name]?.userData?.aptExamplePose || DEFAULT_SLOTS[name] || {};
        gesture = {
          kind: 'room',
          name,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: cur.yaw ?? 0,
          liftY: clampDragY(cur.y ?? 0)
        };
        selectPlaced('room', name);
        setLookBlocked(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }

    const worldHits = _raycaster.intersectObjects(worldGroup.children, true);
    for (const hit of worldHits) {
      const id = worldPieceIdFromHit(hit.object);
      if (id) {
        const cur = worldPieces[id]?.userData?.aptExamplePose || {};
        gesture = {
          kind: 'world',
          name: id,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: cur.yaw ?? 0,
          liftY: clampDragY(cur.y ?? 0)
        };
        selectPlaced('world', id);
        setLookBlocked(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }

    const catHits = _raycaster.intersectObjects(catalogGroup.children, true);
    for (const hit of catHits) {
      const name = catalogNameFromHit(hit.object);
      if (name) {
        const slot = DEFAULT_SLOTS[name] || { yaw: 0 };
        gesture = {
          kind: 'catalog',
          name,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: slot.yaw ?? 0,
          liftY: 0
        };
        const idx = cycleNames.indexOf(name);
        if (idx >= 0) setCatalogSelection(idx);
        else selectPlaced('catalog', name);
        setLookBlocked(true);
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }

    // LMB on staging ground / room floor → place currently selected catalog item.
    if (api.selectedName) {
      const roomLocal = rayRoomFloorLocal();
      if (roomLocal) {
        const slot = DEFAULT_SLOTS[api.selectedName] || { yaw: 0, scale: 1 };
        api.addFromCatalog(api.selectedName, {
          x: roomLocal.x,
          y: 0,
          z: roomLocal.z,
          yaw: slot.yaw ?? 0,
          scale: slot.scale ?? 1
        });
        selectPlaced('room', api.selectedName);
        setLookBlocked(true);
        // Release look on next up via a tiny marker gesture.
        gesture = {
          kind: 'place',
          name: api.selectedName,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: 0,
          liftY: 0
        };
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
      const ground = rayGroundWorld();
      if (ground && inStagingXZ(ground.x, ground.z)) {
        api.placeAtGround(ground.x, ground.z, api.selectedName);
        setLookBlocked(true);
        gesture = {
          kind: 'place',
          name: api.selectedName,
          downX: ev.clientX,
          downY: ev.clientY,
          dragging: false,
          yaw: 0,
          liftY: 0
        };
        ev.stopImmediatePropagation();
        ev.preventDefault();
        return;
      }
    }

    // Miss — let free-flight orbit handle the gesture.
    gesture = null;
  }

  function onPointerMove(ev) {
    if (!gesture || !camera) return;
    if (gesture.kind === 'place') return;
    const dx = ev.clientX - gesture.downX;
    const dy = ev.clientY - gesture.downY;
    if (!gesture.dragging) {
      if (dx * dx + dy * dy < DRAG_THRESH_SQ) return;
      gesture.dragging = true;
      setLookBlocked(true);
      // Detach gizmo while free-dragging so it does not fight.
      if (transformControls?.object) transformControls.detach();
    }

    eventToNdc(ev);
    _raycaster.setFromCamera(_ndc, camera);

    if (gesture.kind === 'catalog') {
      const local = rayRoomFloorLocal();
      if (!local) {
        disposeGhost();
        return;
      }
      applyDragPose(gesture.name, 'catalog', local);
      return;
    }

    if (gesture.kind === 'room') {
      const local = rayRoomFloorLocal();
      if (local) applyDragPose(gesture.name, 'room', local);
      return;
    }

    if (gesture.kind === 'world') {
      const g = rayGroundWorld();
      if (g) applyDragPose(gesture.name, 'world', { x: g.x, z: g.z });
    }
  }

  /**
   * While furniture drag is active: wheel → lift Y.
   * Otherwise near staging: cycle catalog selection (no zoom / fly-speed).
   */
  function onWheel(ev) {
    if (!camera) return;
    if (ev.target?.closest?.(UI_PICK_BLOCK)) return;

    // Gizmo drag: leave wheel unused (do not zoom).
    if (gizmoDragging || transformControls?.dragging) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      return;
    }

    if (gesture && gesture.kind !== 'place') {
      if (!gesture.dragging) {
        gesture.dragging = true;
        setLookBlocked(true);
      }

      // Windows/macOS: wheel up → deltaY < 0 → raise.
      gesture.liftY = clampDragY(gesture.liftY - ev.deltaY * DRAG_Y_WHEEL_SCALE);
      ev.preventDefault();
      ev.stopImmediatePropagation();

      eventToNdc(ev);
      _raycaster.setFromCamera(_ndc, camera);
      if (gesture.kind === 'catalog') {
        const local = rayRoomFloorLocal();
        if (local) applyDragPose(gesture.name, 'catalog', local);
        return;
      }
      if (gesture.kind === 'room') {
        const local = rayRoomFloorLocal();
        const cur = pieces[gesture.name]?.userData?.aptExamplePose;
        const xz = local || (cur ? { x: cur.x, z: cur.z } : null);
        if (xz) applyDragPose(gesture.name, 'room', xz);
        return;
      }
      if (gesture.kind === 'world') {
        const g = rayGroundWorld();
        const cur = worldPieces[gesture.name]?.userData?.aptExamplePose;
        const xz = g || (cur ? { x: cur.x, z: cur.z } : null);
        if (xz) applyDragPose(gesture.name, 'world', xz);
      }
      return;
    }

    // Cycle catalog (incl. nenhum) when pointer is over staging / showcase.
    if (!cycleNames.length || !pointerOverStaging(ev)) return;
    const dir = ev.deltaY > 0 ? 1 : -1;
    cycleCatalog(dir);
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }

  function onPointerUp(ev) {
    if (!gesture) {
      if (!gizmoDragging) setLookBlocked(false);
      return;
    }
    const g = gesture;
    gesture = null;

    if (g.kind === 'place') {
      if (!gizmoDragging) setLookBlocked(false);
      return;
    }

    const dx = ev.clientX - g.downX;
    const dy = ev.clientY - g.downY;
    const wasDrag = g.dragging || dx * dx + dy * dy >= DRAG_THRESH_SQ;

    if (g.kind === 'catalog') {
      if (!wasDrag) {
        // Short click — select + add default slot into room (legacy).
        disposeGhost();
        api.addFromCatalog(g.name);
        selectPlaced('room', g.name);
      } else {
        eventToNdc(ev);
        if (camera) _raycaster.setFromCamera(_ndc, camera);
        const local = camera ? rayRoomFloorLocal() : null;
        disposeGhost();
        if (local) {
          api.addFromCatalog(g.name, {
            x: local.x,
            y: poseYFromLift(g.liftY),
            z: local.z,
            yaw: g.yaw,
            scale: 1
          });
          selectPlaced('room', g.name);
        }
        // Drop outside room → cancel (no add).
      }
    } else if (g.kind === 'room' && wasDrag) {
      const pose = api.getPose(g.name);
      if (pose) api.setPose(g.name, pose);
      selectPlaced('room', g.name);
    } else if (g.kind === 'room' && !wasDrag) {
      selectPlaced('room', g.name);
    } else if (g.kind === 'world') {
      selectPlaced('world', g.name);
    }

    if (!gizmoDragging) setLookBlocked(false);
  }

  function onKeyDown(ev) {
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    const k = ev.code;
    if (k === 'Escape') {
      if (selectedIndex >= 0 || gizmoTargetKind === 'catalog') {
        setCatalogSelection(-1);
        ev.preventDefault();
      }
      return;
    }
    // 1/2/3 always; Alt+W/E/R mirrors Unreal without stealing WASD freefly.
    const ueChord = ev.altKey;
    if (k === 'Digit1' || (ueChord && k === 'KeyW')) {
      setGizmoMode('translate');
      ev.preventDefault();
    } else if (k === 'Digit2' || (ueChord && k === 'KeyE')) {
      setGizmoMode('rotate');
      ev.preventDefault();
    } else if (k === 'Digit3' || (ueChord && k === 'KeyR')) {
      setGizmoMode('scale');
      ev.preventDefault();
    }
  }

  if (camera && typeof window !== 'undefined') {
    const target = dom || window;

    if (typeof document !== 'undefined') {
      hudWrap = document.createElement('div');
      hudWrap.id = 'apt-staging-hud-wrap';
      previewCanvas = document.createElement('canvas');
      previewCanvas.id = 'apt-staging-preview';
      previewCanvas.width = PREVIEW_PX;
      previewCanvas.height = PREVIEW_PX;
      previewCanvas.setAttribute('aria-hidden', 'true');
      previewCtx = previewCanvas.getContext('2d', { alpha: false });
      hudEl = document.createElement('div');
      hudEl.id = 'apt-staging-hud';
      hudWrap.appendChild(previewCanvas);
      hudWrap.appendChild(hudEl);
      document.body.appendChild(hudWrap);
      paintPreviewPlaceholder();
    }

    try {
      transformControls = new TransformControls(camera, target === window ? document.body : target);
      transformControls.setSize(0.85);
      transformControls.setSpace('world');
      transformHelper = transformControls.getHelper();
      parent.add(transformHelper);
      transformControls.detach();
      transformControls.addEventListener('dragging-changed', (e) => {
        gizmoDragging = !!e.value;
        setLookBlocked(gizmoDragging);
        if (!gizmoDragging && transformControls.object) {
          syncPoseFromObject(transformControls.object, gizmoTargetKind, gizmoTargetName);
        }
      });
      transformControls.addEventListener('objectChange', () => {
        if (transformControls?.object) {
          syncPoseFromObject(transformControls.object, gizmoTargetKind, gizmoTargetName);
        }
      });
    } catch (err) {
      console.warn('[apt-example] TransformControls init failed', err);
      transformControls = null;
    }

    // Capture phase so we can consume furniture hits before free-flight look.
    target.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    // Capture + non-passive so height scroll / catalog cycle wins over zoom.
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', onKeyDown);

    setCatalogSelection(0);

    api._unbindPick = () => {
      target.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
      disposeGhost();
      detachGizmo();
      clearCatalogHighlight();
      if (transformControls) {
        try {
          transformControls.dispose();
        } catch (_) {
          /* ignore */
        }
        transformControls = null;
      }
      if (transformHelper?.parent) transformHelper.parent.remove(transformHelper);
      transformHelper = null;
      disposePreviewPipeline();
      if (hudWrap?.parentNode) hudWrap.parentNode.removeChild(hudWrap);
      hudWrap = null;
      hudEl = null;
      previewCanvas = null;
      previewCtx = null;
      setLookBlocked(false);
    };
  }

  console.info(
    '[apt-example] sandbox at',
    cfg.x.toFixed(1),
    cfg.z.toFixed(1),
    'yaw',
    cfg.yaw.toFixed(2),
    'catalog',
    Object.keys(catalog).length,
    'staging: wheel cycle+nenhum · HUD preview · LMB place · Esc · W/E/R gizmo · RMB pan'
  );
  return api;
}
