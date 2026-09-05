import * as THREE from 'three';

export function collectStreetlightPoses(xs, zs) {
  const poses = [];
  for (const sx of xs) {
    for (let j = 0; j < zs.length - 1; j++) {
      const z = (zs[j] + zs[j + 1]) / 2;
      poses.push({ x: sx - 8.5, z, rot: -Math.PI / 2 });
      poses.push({ x: sx + 8.5, z, rot: Math.PI / 2 });
    }
  }
  return poses;
}

export function createStreetlightModel() {
  const root = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.85,
    roughness: 0.3
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfef08a,
    emissiveIntensity: 0.8
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 12), metalMat);
  base.position.y = 0.2;
  base.castShadow = true;
  base.receiveShadow = false;
  root.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 6.2, 12), metalMat);
  pole.position.y = 3.3;
  pole.castShadow = true;
  pole.receiveShadow = false;
  root.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), metalMat);
  arm.position.set(0.7, 6.1, 0);
  arm.rotation.z = -Math.PI / 3.2;
  arm.castShadow = true;
  arm.receiveShadow = false;
  root.add(arm);
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.5), metalMat);
  fixture.position.set(1.45, 5.85, 0);
  fixture.castShadow = true;
  fixture.receiveShadow = false;
  root.add(fixture);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.42), lampMat);
  bulb.position.set(1.45, 5.79, 0);
  root.add(bulb);
  return root;
}
