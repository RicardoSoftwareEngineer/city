/**
 * Extract window slots from MI_FakeInterior* triangles before mergeBuilding.
 * Clusters triangle centroids into window-sized openings in root-local space.
 */

import * as THREE from 'three';

const CLUSTER_THRESH = 1.5;
const _rootInv = new THREE.Matrix4();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _cent = new THREE.Vector3();
const _n = new THREE.Vector3();
const _size = new THREE.Vector3();

function isFakeInterior(material) {
  return typeof material?.name === 'string' && material.name.startsWith('MI_FakeInterior');
}

function eachFakeTriangle(root, visit) {
  root.updateMatrixWorld(true);
  _rootInv.copy(root.matrixWorld).invert();

  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const geom = child.geometry;
    const pos = geom.attributes.position;
    if (!pos) return;
    const index = geom.index;
    const groups = geom.groups?.length
      ? geom.groups
      : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];

    const toLocal = new THREE.Matrix4().multiplyMatrices(_rootInv, child.matrixWorld);

    for (const group of groups) {
      const mat = materials[group.materialIndex] || materials[0];
      if (!isFakeInterior(mat)) continue;

      for (let i = group.start; i < group.start + group.count; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;
        _vA.fromBufferAttribute(pos, ia).applyMatrix4(toLocal);
        _vB.fromBufferAttribute(pos, ib).applyMatrix4(toLocal);
        _vC.fromBufferAttribute(pos, ic).applyMatrix4(toLocal);
        _cent.copy(_vA).add(_vB).add(_vC).multiplyScalar(1 / 3);
        _n.copy(_vB).sub(_vA).cross(_vC.clone().sub(_vA));
        if (_n.lengthSq() > 1e-12) _n.normalize();
        else _n.set(0, 0, -1);
        visit(_cent.clone(), _n.clone(), _vA.clone(), _vB.clone(), _vC.clone());
      }
    }
  });
}

function floodClusters(tris) {
  const used = new Array(tris.length).fill(false);
  const clusters = [];
  for (let i = 0; i < tris.length; i++) {
    if (used[i]) continue;
    const members = [tris[i]];
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < tris.length; j++) {
        if (used[j]) continue;
        const cj = tris[j].c;
        if (members.some((m) => m.c.distanceTo(cj) < CLUSTER_THRESH)) {
          members.push(tris[j]);
          used[j] = true;
          changed = true;
        }
      }
    }
    clusters.push(members);
  }
  return clusters;
}

function slotFromCluster(members, id) {
  const center = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const box = new THREE.Box3();
  for (const m of members) {
    center.add(m.c);
    normal.add(m.n);
    box.expandByPoint(m.a);
    box.expandByPoint(m.b);
    box.expandByPoint(m.cv);
  }
  center.multiplyScalar(1 / members.length);
  if (normal.lengthSq() < 1e-8) normal.set(0, 0, -1);
  else normal.normalize();

  box.getSize(_size);
  // Snap outward axis to the thin dimension of the window quad.
  if (_size.x <= _size.z && _size.x <= _size.y) {
    const sx = Math.sign(normal.x) || (center.x >= 0 ? 1 : -1);
    normal.set(sx, 0, 0);
  } else {
    const sz = Math.sign(normal.z) || -1;
    normal.set(0, 0, sz);
  }

  const width = Math.max(Math.max(_size.x, _size.z), 0.6);
  const height = Math.max(_size.y, 0.6);

  return {
    id,
    x: center.x,
    y: center.y,
    z: center.z,
    width,
    height,
    nx: normal.x,
    ny: normal.y,
    nz: normal.z
  };
}

/**
 * @param {THREE.Object3D} root prepared building root (pre-merge)
 * @returns {Array<{id:number,x:number,y:number,z:number,width:number,height:number,nx:number,ny:number,nz:number}>}
 */
export function extractWindowSlots(root) {
  if (!root) return [];
  const tris = [];
  eachFakeTriangle(root, (c, n, a, b, cv) => {
    tris.push({ c, n, a, b, cv });
  });
  if (!tris.length) return [];
  return floodClusters(tris).map((members, i) => slotFromCluster(members, i));
}
