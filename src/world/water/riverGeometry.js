/**
 * Flat ribbon BufferGeometry for an S-river.
 * Built in local XY (like PlaneGeometry / CircleGeometry) so Water.js /
 * Reflector get local normal +Z; callers set mesh.rotation.x = -PI/2 and
 * mesh.position.y = waterY. Local (x,y,0) maps to world (x, waterY, y).
 */

import * as THREE from 'three';
import {
  riverPolyline,
  RIVER_CROSS,
  RIVER_HALF_WIDTH
} from './rivers.js';

/**
 * @param {{ id: string, halfWidth?: number }} river
 * @returns {THREE.BufferGeometry}
 */
export function buildRiverRibbonGeometry(river) {
  const line = riverPolyline(river);
  const halfW = river.halfWidth ?? RIVER_HALF_WIDTH;
  const cross = RIVER_CROSS;
  const nAlong = line.length;
  if (nAlong < 2) {
    return new THREE.BufferGeometry();
  }

  const cols = cross + 1; // vertices across
  const vertCount = nAlong * cols;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  // Arc-length for U
  const arc = new Float32Array(nAlong);
  arc[0] = 0;
  for (let i = 1; i < nAlong; i++) {
    arc[i] =
      arc[i - 1] +
      Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  }
  const totalLen = arc[nAlong - 1] || 1;

  for (let i = 0; i < nAlong; i++) {
    const p = line[i];
    // Tangent in XZ
    let tx;
    let tz;
    if (i === 0) {
      tx = line[1].x - p.x;
      tz = line[1].z - p.z;
    } else if (i === nAlong - 1) {
      tx = p.x - line[i - 1].x;
      tz = p.z - line[i - 1].z;
    } else {
      tx = line[i + 1].x - line[i - 1].x;
      tz = line[i + 1].z - line[i - 1].z;
    }
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    // Left normal in XZ (perpendicular)
    const lx = -tz;
    const lz = tx;

    const u = arc[i] / totalLen;
    for (let c = 0; c < cols; c++) {
      const v = c / cross; // 0..1 across
      const lat = (v * 2 - 1) * halfW; // -halfW .. +halfW
      const wx = p.x + lx * lat;
      const wz = p.z + lz * lat;
      const vi = i * cols + c;
      // Local XY: X=worldX, Y=worldZ, Z=0 → after rot.x=-PI/2 → world XZ
      positions[vi * 3] = wx;
      positions[vi * 3 + 1] = wz;
      positions[vi * 3 + 2] = 0;
      normals[vi * 3] = 0;
      normals[vi * 3 + 1] = 0;
      normals[vi * 3 + 2] = 1;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  const indices = [];
  for (let i = 0; i < nAlong - 1; i++) {
    for (let c = 0; c < cross; c++) {
      const a = i * cols + c;
      const b = a + 1;
      const d = (i + 1) * cols + c;
      const e = d + 1;
      indices.push(a, d, b);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Average tangent of the river as a Vector2 (xz → xy for Water2 flowDirection).
 * @param {{ id: string }} river
 * @returns {THREE.Vector2}
 */
export function approxFlowDirection(river) {
  const line = riverPolyline(river);
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < line.length - 1; i++) {
    sx += line[i + 1].x - line[i].x;
    sz += line[i + 1].z - line[i].z;
  }
  const len = Math.hypot(sx, sz) || 1;
  return new THREE.Vector2(sx / len, sz / len);
}
