/**
 * Quantize streaming focus to a cell grid (not every centimetre of the car).
 * MemoryGuardian radius / WorldStream stay unchanged — only the focus point snaps.
 *
 * Aligned with terrain fine tiles (TERRAIN_TILE + GRID_OFFSET) by default.
 * Hysteresis: keep the old cell until the car is well into a neighbour, so
 * borders do not thrash load ↔ unload.
 */

/**
 * @param {{ cellSize?: number, offset?: number, hysteresis?: number }} [opts]
 */
export function createFocusGrid(opts = {}) {
  const cellSize = opts.cellSize ?? 40;
  const offset = opts.offset ?? -10;
  /** Metres past the cell edge before focus switches. */
  const hysteresis = opts.hysteresis ?? 8;

  let key = null;
  let cx = 0;
  let cz = 0;

  function cellOf(x, z) {
    const x0 = offset + Math.floor((x - offset) / cellSize) * cellSize;
    const z0 = offset + Math.floor((z - offset) / cellSize) * cellSize;
    return {
      x0,
      z0,
      cx: x0 + cellSize * 0.5,
      cz: z0 + cellSize * 0.5,
      key: `${x0}:${z0}`
    };
  }

  return {
    get cellSize() {
      return cellSize;
    },
    get focus() {
      return { x: cx, z: cz, key };
    },

    /**
     * @param {number} x car world X
     * @param {number} z car world Z
     * @returns {{ x: number, z: number, key: string|null, changed: boolean }}
     */
    update(x, z) {
      const c = cellOf(x, z);
      if (key == null) {
        key = c.key;
        cx = c.cx;
        cz = c.cz;
        return { x: cx, z: cz, key, changed: true };
      }
      if (c.key === key) {
        return { x: cx, z: cz, key, changed: false };
      }
      // Stay on old centre until past half-cell + hysteresis (into neighbour).
      const half = cellSize * 0.5;
      const cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      if (cheb <= half + hysteresis) {
        return { x: cx, z: cz, key, changed: false };
      }
      key = c.key;
      cx = c.cx;
      cz = c.cz;
      return { x: cx, z: cz, key, changed: true };
    }
  };
}
