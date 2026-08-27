/**
 * StreetFurniture — Source stairs, shop kits, fire escapes, and street props.
 */

import * as THREE from 'three';
import { GRID_STREET_COUNT, SIDEWALK_EDGE, gridStreetCoords } from './RoadDimensions.js';
import { downtown } from './downtownSrc.js';
import { noCastOpts, castOpts } from './shadowPolicy.js';

const CAST_KEYS = new Set([
  'stairsConcrete', 'stairsMarble',
  'railsConcrete', 'railsMarble', 'railsMetal',
  'railsConcreteS1', 'railsConcreteS2',
  'railsMarbleS1', 'railsMarbleS2',
  'railsMetalS1', 'railsMetalS2',
  'fireB', 'fireC', 'fireT',
  'planterC', 'planterL', 'planterR',
  'planterSC', 'planterSL', 'planterSR',
  'bollard', 'arch', 'colTrim',
  'entranceM21', 'entranceM22', 'entranceC22'
]);

const VC = { keepVertexColors: true };
const WALL = SIDEWALK_EDGE + 0.08;

const FILES = {
  stairsConcrete: 'Stairs_Entrance_Concrete.gltf',
  stairsMarble: 'Stairs_Entrance_Marble.gltf',
  railsConcrete: 'Stairs_Rails_Concrete.gltf',
  railsMarble: 'Stairs_Rails_Marble.gltf',
  railsMetal: 'Stairs_Rails_Metal.gltf',
  railsConcreteS1: 'Stairs_Rails_Concrete_Straight_1.gltf',
  railsConcreteS2: 'Stairs_Rails_Concrete_Straight_2.gltf',
  railsMarbleS1: 'Stairs_Rails_Marble_Straight_1.gltf',
  railsMarbleS2: 'Stairs_Rails_Marble_Straight_2.gltf',
  railsMetalS1: 'Stairs_Rails_Metal_Straight_1.gltf',
  railsMetalS2: 'Stairs_Rails_Metal_Straight_2.gltf',
  jadeV: 'Prop_Sign_JadeGarden_Vertical.gltf',
  jade: 'Prop_Sign_JadeGarden.gltf',
  jadeL: 'Prop_Sign_JadeGarden_Side_L.gltf',
  jadeR: 'Prop_Sign_JadeGarden_Side_R.gltf',
  bakery: 'Prop_Sign_Bakery.gltf',
  carmines: 'Prop_Sign_Carmines.gltf',
  carminesSide: 'Prop_Sign_Carmines_Side.gltf',
  deli: 'Prop_Sign_Deli.gltf',
  hannigan: 'Prop_Sign_Hannigan.gltf',
  mays: 'Prop_Sign_Mays.gltf',
  hwL: 'Prop_Sign_HW_Side_L.gltf',
  hwR: 'Prop_Sign_HW_Side_R.gltf',
  awning: 'Prop_Awning.gltf',
  awningLong: 'Prop_Awning_Long.gltf',
  awningBakery: 'Prop_Awning.gltf',
  awningCarmines: 'Prop_Awning.gltf',
  awningCarminesLong: 'Prop_Awning_Long.gltf',
  awningPub: 'Prop_Awning.gltf',
  awningPubLong: 'Prop_Awning_Long.gltf',
  fireB: 'Prop_FireEscape_Bottom.gltf',
  fireC: 'Prop_FireEscape_Center.gltf',
  fireT: 'Prop_FireEscape_Top.gltf',
  drain: 'Prop_Drain.gltf',
  bollard: 'Prop_Bollard.gltf',
  ac: 'Prop_ACUnit.gltf',
  manhole: 'Prop_ManholeCover.gltf',
  planterC: 'Prop_Planter_Center.gltf',
  planterL: 'Prop_Planter_Side_L.gltf',
  planterR: 'Prop_Planter_Side_R.gltf',
  planterSC: 'Prop_Planter_Small_Center.gltf',
  planterSL: 'Prop_Planter_Small_Side_L.gltf',
  planterSR: 'Prop_Planter_Small_Side_R.gltf',
  arch: 'Prop_ColumnArch.gltf',
  colTrim: 'Prop_Column_Trim.gltf',
  ornament2: 'Prop_Ornament_2.gltf',
  ornament3: 'Prop_Ornament_3.gltf',
  entranceM21: 'Entrance_Marble_2x1.gltf',
  entranceM22: 'Entrance_Marble_2x2.gltf',
  entranceC22: 'Entrance_Concrete_2x2.gltf',
  curve4s: 'Street_Curve_4Lane_Short_Curb.gltf',
  curve4l: 'Street_Curve_4Lane_Long_Curb.gltf',
  curve4short: 'Street_Curve_4LaneShort.gltf',
  curve4long: 'Street_Curve_4LaneLong.gltf',
  curve2: 'Street_Curve_2Lane.gltf',
  asphaltCurve2: 'Street_Asphalt_Curve_2Lane.gltf',
  asphaltCurve4s: 'Street_Asphalt_Curve_4Lane_Short.gltf',
  asphaltCurve4l: 'Street_Asphalt_Curve_4Lane_Long.gltf',
  decalCurve2: 'Decal_Curve_2Lane_Stripe.gltf',
  decalCurve4s: 'Decal_Curve_4LaneShort_Stripe.gltf',
  decalCurve4l: 'Decal_Curve_4LaneLong_Stripe.gltf',
  ramp: 'Sidewalk_CornerRamp_Round_3m.gltf'
};

function west(sx, z) {
  return { x: sx + WALL, z, rot: -Math.PI / 2 };
}

function east(sx, z) {
  return { x: sx - WALL, z, rot: Math.PI / 2 };
}

function south(sz, x) {
  return { x, z: sz + WALL, rot: Math.PI };
}

function north(sz, x) {
  return { x, z: sz - WALL, rot: 0 };
}

export class StreetFurniture {
  collectJobs() {
    const xs = gridStreetCoords();
    const zs = gridStreetCoords();
    const jobs = [];
    const add = (key, poses, priority = 1) => {
      if (poses?.length) {
        jobs.push({
          url: downtown(FILES[key]),
          poses,
          options: CAST_KEYS.has(key) ? castOpts() : noCastOpts(),
          priority
        });
      }
    };

    this.placeStairs(add, xs, zs);
    this.placeShopKits(add, xs, zs);
    this.placeFireEscapes(add, xs, zs);
    this.placeStreetProps(add, xs, zs);
    this.placePlanterRows(add, xs, zs);
    this.placeExtraRoads(add, xs, zs);
    return {
      jobs,
      streetlightPoses: this.collectStreetlightPoses(xs, zs),
      streetlightTemplate: this.createStreetlightModel()
    };
  }

  collectStreetlightPoses(xs, zs) {
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

  placeStairs(add, xs, zs) {
    const concrete = [];
    const marble = [];
    for (let i = 0; i < GRID_STREET_COUNT; i++) {
      for (let j = 0; j < GRID_STREET_COUNT - 1; j++) {
        if (i === 0 && j === 0) continue;
        const z = (zs[j] + zs[j + 1]) / 2;
        const useMarble = (i + j) % 3 === 0;
        const bucket = useMarble ? marble : concrete;
        if (i < GRID_STREET_COUNT - 1) {
          bucket.push({ x: xs[i] + 8.5, z, rot: -Math.PI / 2 });
        }
        if (i > 0) {
          bucket.push({ x: xs[i] - 8.5, z, rot: Math.PI / 2 });
        }
      }
    }

    add('stairsConcrete', concrete);
    add('railsConcrete', concrete);

    add('stairsMarble', marble);
    add('railsMarble', marble);
  }

  createStreetlightModel() {
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

  placeShopKits(add, xs, zs) {
    const signY = 5.35;
    const sideY = 4.4;

    add('jadeV', [
      { x: xs[0] + 9.1, y: 6.2, z: zs[1] + 30, rot: 0 },
      { x: xs[1] - 9.1, y: 6.2, z: zs[1] + 30, rot: Math.PI }
    ]);

    const jade = west(xs[0], zs[1] + 30);
    add('jade', [{ ...jade, y: signY }]);
    add('jadeL', [{ ...west(xs[0], zs[1] + 30 - 3.2), y: sideY }]);
    add('jadeR', [{ ...west(xs[0], zs[1] + 30 + 3.2), y: sideY }]);

    const shops = [
      { mesh: 'bakery', awning: 'awningBakery', face: west(xs[0], zs[2] + 30) },
      { mesh: 'carmines', awning: 'awningCarmines', face: west(xs[1], zs[0] + 30) },
      { mesh: 'deli', awning: 'awningPub', face: west(xs[1], zs[1] + 30) },
      { mesh: 'hannigan', awning: 'awning', face: west(xs[2], zs[0] + 30) },
      { mesh: 'mays', awning: 'awningLong', face: west(xs[2], zs[1] + 30) }
    ];
    for (const shop of shops) {
      add(shop.mesh, [{ ...shop.face, y: signY }]);
      add(shop.awning, [{ ...shop.face, y: 0 }]);
    }

    add('carminesSide', [{ ...west(xs[1], zs[0] + 30 - 4), y: sideY }]);
    add('hwL', [{ ...east(xs[2], zs[2] + 30 - 2), y: sideY }]);
    add('hwR', [{ ...east(xs[2], zs[2] + 30 + 2), y: sideY }]);

    add('awningCarminesLong', [{ ...east(xs[1], zs[0] + 30), y: 0 }]);
    add('awningPubLong', [{ ...east(xs[1], zs[1] + 30), y: 0 }]);
    add('awningLong', [{ ...north(zs[2], xs[1] + 30), y: 0 }]);

    add('arch', [{ ...west(xs[1], zs[2] + 30), y: 0 }]);
    add('colTrim', [
      { ...west(xs[1], zs[2] + 28), y: 0 },
      { ...west(xs[1], zs[2] + 32), y: 0 }
    ]);
    add('entranceM21', [{ ...south(zs[1], xs[1] + 30), y: 0 }]);
    add('entranceM22', [{ ...north(zs[1], xs[2] + 30), y: 0 }]);
    add('entranceC22', [{ ...east(xs[3], zs[1] + 30), y: 0 }]);
    add('ornament2', [{ ...west(xs[2], zs[2] + 30), y: 4.2 }]);
    add('ornament3', [{ ...east(xs[2], zs[0] + 30), y: 4.2 }]);
  }

  placeFireEscapes(add, xs, zs) {
    const bottoms = [];
    const centers = [];
    const tops = [];
    const stacks = [
      east(xs[1], zs[0] + 30),
      east(xs[1], zs[1] + 30),
      east(xs[2], zs[1] + 30),
      west(xs[2], zs[2] + 30),
      north(zs[2], xs[0] + 30),
      south(zs[2], xs[2] + 30)
    ];
    for (const face of stacks) {
      const y0 = 3.32;
      bottoms.push({ ...face, y: y0 });
      let y = 6.4;
      for (let i = 0; i < 4; i++) {
        centers.push({ ...face, y });
        y += 3.07;
      }
      tops.push({ ...face, y });
    }
    add('fireB', bottoms);
    add('fireC', centers);
    add('fireT', tops);
  }

  placeStreetProps(add, xs, zs) {
    const drains = [];
    const acs = [];
    const manholes = [];
    const bollards = [
      { x: 8.35, z: 18.4, rot: 0 },
      { x: 8.35, z: 21.6, rot: 0 }
    ];

    for (const sx of xs) {
      for (let j = 0; j < zs.length - 1; j++) {
        const z0 = zs[j] + 18;
        const z1 = zs[j + 1] - 18;
        for (let z = z0; z <= z1 + 0.01; z += 18) {
          drains.push({ x: sx - 6.15, z, y: -0.15 });
          drains.push({ x: sx + 6.15, z, y: -0.15 });
        }
      }
    }

    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length; j++) {
        if (i > 0 && j > 0) {
          manholes.push({ x: xs[i] + 2.2, z: zs[j] - 2.2, y: -0.148 });
        }
      }
    }

    for (let i = 0; i < GRID_STREET_COUNT - 1; i++) {
      for (let j = 0; j < GRID_STREET_COUNT - 1; j++) {
        if (i === 0 && j === 0) continue;
        const face = west(xs[i], (zs[j] + zs[j + 1]) / 2);
        acs.push({ x: face.x + 2.4, y: 16.2, z: face.z, rot: face.rot });
        acs.push({ x: face.x + 2.4, y: 16.2, z: face.z + 6, rot: face.rot });
      }
    }

    add('drain', drains);
    add('manhole', manholes);
    add('bollard', bollards);
    add('ac', acs);
  }

  placePlanterRows(add, xs, zs) {
    const rowZ = zs[1] - 7.4;
    const startX = xs[1] + 14;
    add('planterC', [
      { x: startX, z: rowZ },
      { x: startX + 2, z: rowZ },
      { x: startX + 4, z: rowZ },
      { x: startX + 6, z: rowZ },
      { x: startX + 8, z: rowZ }
    ]);

    const smallZ = zs[2] + 7.4;
    add('planterSC', [
      { x: xs[0] + 16, z: smallZ },
      { x: xs[0] + 18, z: smallZ },
      { x: xs[0] + 20, z: smallZ },
      { x: xs[0] + 22, z: smallZ }
    ]);
  }

  placeExtraRoads(add, xs, zs) {
    const last = xs.length - 1;
    add('curve2', [{ x: xs[0] - 21, z: zs[0] - 21, rot: 0 }]);
    add('asphaltCurve2', [{ x: xs[0] - 21, z: zs[0] - 21, rot: 0 }]);
    add('curve4s', [{ x: xs[last] + 21, z: zs[0] - 21, rot: Math.PI / 2 }]);
    add('asphaltCurve4s', [{ x: xs[last] + 21, z: zs[0] - 21, rot: Math.PI / 2 }]);
    add('curve4l', [{ x: xs[last] + 21, z: zs[last] + 21, rot: 0 }]);
    add('asphaltCurve4l', [{ x: xs[last] + 21, z: zs[last] + 21, rot: 0 }]);
    add('curve4short', [{ x: xs[0] - 33, z: zs[last] + 9, rot: -Math.PI / 2 }]);
    add('curve4long', [{ x: xs[last] + 9, z: zs[0] - 33, rot: Math.PI / 2 }]);
    add('decalCurve2', [{ x: xs[0] - 21, z: zs[0] - 21, y: 0.02, rot: 0 }]);
    add('decalCurve4s', [{ x: xs[last] + 21, z: zs[0] - 21, y: 0.02, rot: Math.PI / 2 }]);
    add('decalCurve4l', [{ x: xs[last] + 21, z: zs[last] + 21, y: 0.02, rot: 0 }]);
    add('ramp', [
      { x: xs[1] + 7.5, z: zs[1] + 7.5, rot: 0 },
      { x: xs[2] - 7.5, z: zs[2] - 7.5, rot: Math.PI }
    ]);
  }
}
