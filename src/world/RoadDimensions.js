/**
 * RoadDimensions — Standard measurements for the Quaternius Downtown MegaKit.
 *
 * Every number in this file comes from real vertex-level inspection of the
 * official GLTF models.  Import these constants instead of using magic numbers
 * so the entire city stays dimensionally consistent.
 *
 * Coordinate system (Three.js default):
 *   X = left/right   (negative = left,  positive = right)
 *   Y = up/down      (0 = sidewalk top, negative = below curb)
 *   Z = forward/back (positive = forward along avenue)
 */

// ── Road ───────────────────────────────────────────────────────────────────
export const ROAD_HALF_WIDTH    = 6.0;   // Each traffic lane is 6 m wide
export const ROAD_TOTAL_WIDTH   = 12.0;  // Two lanes side by side

// ── Sidewalk ───────────────────────────────────────────────────────────────
export const SIDEWALK_WIDTH     = 3.0;   // Sidewalk tile width
export const SIDEWALK_EDGE      = 9.0;   // Outer edge X = ROAD_HALF_WIDTH + SIDEWALK_WIDTH

// ── Vertical levels (Y axis) ──────────────────────────────────────────────
export const SIDEWALK_SURFACE_Y = 0.0;
export const CURB_DROP          = 0.150; // 15 cm curb height
export const ASPHALT_SURFACE_Y  = -0.150;
export const STRIPE_Y           = -0.148; // Road markings sit slightly above asphalt to avoid z-fighting

// ── Tile sizes ─────────────────────────────────────────────────────────────
export const ASPHALT_TILE_SIZE  = 6.0;   // Street_Asphalt_6x6 is 6×6 m
export const SIDEWALK_TILE_SIZE = 3.0;   // Sidewalk_Straight_3m is 3×3 m

// ── Avenue layout ──────────────────────────────────────────────────────────
export const AVENUE_START_Z     = 12;    // First asphalt tile Z after intersection
export const AVENUE_END_Z       = 252;   // Last asphalt tile Z (legacy single avenue)
export const AVENUE_BACK_END_Z  = -48;   // South-going street beyond the 4-way
export const SIDEWALK_CENTER_X  = 7.5;   // X center of each sidewalk row (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2)
export const SIDEWALK_CURB_TREE_X = 6.5; // Center of the 1 m square on the curb (street) edge

// ── Neighborhood grid (4 north–south × 4 east–west streets) ───────────────
export const GRID_STREET_COUNT = 4;
export const GRID_PITCH        = 60;    // Center-to-center; 42 m interior for two building rows
export const INTERSECTION_CLEAR = 10.5; // Skip sidewalk/asphalt overlap with 18 m intersection

export function gridStreetCoords() {
  return Array.from({ length: GRID_STREET_COUNT }, (_, i) => i * GRID_PITCH);
}

/** Outer playable AABB. Past sidewalk (9 m) and the SW edge curve (−21). */
export const CITY_BOUND_PAD = 24;

export function cityBounds() {
  const last = (GRID_STREET_COUNT - 1) * GRID_PITCH;
  return {
    minX: -CITY_BOUND_PAD,
    maxX: last + CITY_BOUND_PAD,
    minZ: -CITY_BOUND_PAD,
    maxZ: last + CITY_BOUND_PAD
  };
}

export function isInsideCity(x, z) {
  const b = cityBounds();
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

/**
 * Paved rect the terrain hides under: streets 0…180 plus 9 m of sidewalk and
 * 1 m of margin. 200 m per side, so it is exactly 5 fine terrain tiles and the
 * terrain grid can align to it without any tile straddling the border.
 */
export const CITY_PAVED_MIN = -10;
export const CITY_PAVED_MAX = 190;

/** Terrain surface under the pavement: 10 cm below the asphalt, so it hides. */
export const CITY_BURY_Y = ASPHALT_SURFACE_Y - 0.10;
/** Meters used to ramp from open grass (0) down to CITY_BURY_Y. */
export const CITY_BURY_RAMP = 1.5;

/** Meters inside the paved rect (>0 inside, <=0 outside). */
export function pavedInset(x, z) {
  return Math.min(
    x - CITY_PAVED_MIN,
    CITY_PAVED_MAX - x,
    z - CITY_PAVED_MIN,
    CITY_PAVED_MAX - z
  );
}

// ── Physics ────────────────────────────────────────────────────────────────
export const GROUND_BODY_HALF   = 560;   // Physics + terrain half-extent (Witcher vista)
export const GROUND_BODY_DEPTH  = 5;     // Physics ground half-height (box)
export const GROUND_BODY_Y      = -(GROUND_BODY_DEPTH + ASPHALT_SURFACE_Y * -1); // Top surface = ASPHALT_SURFACE_Y

// ── Porsche 911 ────────────────────────────────────────────────────────────
export const PORSCHE_TARGET_LENGTH  = 4.57;
export const PORSCHE_WHEEL_RADIUS   = 0.38;
export const PORSCHE_SPAWN_Y        = 0.731;
export const PORSCHE_ROOT_OFFSET_Y  = -0.34;
export const PORSCHE_HALF_TRACK     = 0.82;  // Half-width between left and right wheels
export const PORSCHE_FRONT_AXLE_Z   = 1.24;
export const PORSCHE_REAR_AXLE_Z    = -1.33;
