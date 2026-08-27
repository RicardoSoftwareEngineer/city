/**
 * Sidewalk — Builds all sidewalk geometry: straight tiles, rounded corners,
 * planters, and trees.
 *
 * The 3 m sidewalk tile is a 3×3 grid of 1 m squares. Downtown MegaKit
 * video trees sit in a one-square grate using Nature Pack CommonTree
 * (pale trunk via vertex colors, clustered leaf planes).
 */

import { loadGltf } from './AssetLoader.js';
import { downtown } from './downtownSrc.js';
import {
  SIDEWALK_CENTER_X,
  SIDEWALK_CURB_TREE_X,
  SIDEWALK_TILE_SIZE,
  AVENUE_END_Z
} from './RoadDimensions.js';

const ASSET_PATHS = {
  straight: downtown('Sidewalk_Straight_3m.gltf'),
  planter:  downtown('Sidewalk_Planter.gltf'),
  tree1:    '/models/nature/CommonTree_1.gltf',
  tree2:    '/models/nature/CommonTree_2.gltf',
  tree3:    '/models/nature/CommonTree_3.gltf',
  tree4:    '/models/nature/CommonTree_4.gltf',
  tree5:    '/models/nature/CommonTree_5.gltf'
};

// Sidewalk_Planter is ~2 m wide; 0.48 → ~1 m (one visual sidewalk square).
const PLANTER_SCALE = 0.48;
// CommonTree canopy ~4.3 m at scale 1; 0.42 keeps a young street tree in the grate.
const TREE_SCALE = 0.42;

export class Sidewalk {
  async build(parentGroup) {
    const [straight, planter, tree1, tree2, tree3, tree4, tree5] = await Promise.all([
      loadGltf(ASSET_PATHS.straight),
      loadGltf(ASSET_PATHS.planter),
      loadGltf(ASSET_PATHS.tree1, { keepVertexColors: true }),
      loadGltf(ASSET_PATHS.tree2, { keepVertexColors: true }),
      loadGltf(ASSET_PATHS.tree3, { keepVertexColors: true }),
      loadGltf(ASSET_PATHS.tree4, { keepVertexColors: true }),
      loadGltf(ASSET_PATHS.tree5, { keepVertexColors: true })
    ]);

    const trees = [tree1, tree2, tree3, tree4, tree5].filter(Boolean);

    // Note: Street_TIntersection already includes the closed south sidewalk bar.
    if (straight) {
      this.buildCrossStreetSidewalks(parentGroup, straight);
      this.buildAvenueSidewalks(parentGroup, straight, planter, trees);
    }
  }

  buildCrossStreetSidewalks(group, straight) {
    // North side (Z = +7.5) — curbs face -Z into the cross street
    for (let x = -10.5; x >= -40.5; x -= SIDEWALK_TILE_SIZE) {
      const tile = straight.clone();
      tile.position.set(x, 0, SIDEWALK_CENTER_X);
      tile.rotation.y = Math.PI;
      group.add(tile);
    }
    for (let x = 10.5; x <= 40.5; x += SIDEWALK_TILE_SIZE) {
      const tile = straight.clone();
      tile.position.set(x, 0, SIDEWALK_CENTER_X);
      tile.rotation.y = Math.PI;
      group.add(tile);
    }

    // South side (Z = -7.5) — curbs face +Z into the cross street
    for (let x = -10.5; x >= -40.5; x -= SIDEWALK_TILE_SIZE) {
      const tile = straight.clone();
      tile.position.set(x, 0, -SIDEWALK_CENTER_X);
      tile.rotation.y = 0;
      group.add(tile);
    }
    for (let x = 10.5; x <= 40.5; x += SIDEWALK_TILE_SIZE) {
      const tile = straight.clone();
      tile.position.set(x, 0, -SIDEWALK_CENTER_X);
      tile.rotation.y = 0;
      group.add(tile);
    }
  }

  buildAvenueSidewalks(group, straight, planter, trees) {
    let treeIndex = 0;

    const zPositions = [];
    for (let z = 10.5; z <= AVENUE_END_Z; z += SIDEWALK_TILE_SIZE) zPositions.push(z);

    for (const z of zPositions) {
      const left = straight.clone();
      left.position.set(-SIDEWALK_CENTER_X, 0, z);
      left.rotation.y = Math.PI / 2;
      group.add(left);

      const right = straight.clone();
      right.position.set(SIDEWALK_CENTER_X, 0, z);
      right.rotation.y = -Math.PI / 2;
      group.add(right);

      const isPlanter = (z === 10.5) || (Math.abs(Math.round(z)) % 18 === 9);
      if (!isPlanter) continue;

      if (planter) {
        const planterLeft = planter.clone();
        planterLeft.position.set(-SIDEWALK_CURB_TREE_X, 0, z);
        planterLeft.scale.setScalar(PLANTER_SCALE);
        group.add(planterLeft);

        const planterRight = planter.clone();
        planterRight.position.set(SIDEWALK_CURB_TREE_X, 0, z);
        planterRight.scale.setScalar(PLANTER_SCALE);
        group.add(planterRight);
      }

      if (trees.length === 0) continue;

      const treeLeft = trees[treeIndex % trees.length].clone();
      treeLeft.position.set(-SIDEWALK_CURB_TREE_X, 0.0, z);
      treeLeft.scale.setScalar(TREE_SCALE);
      treeLeft.rotation.y = (z * 0.7) % (Math.PI * 2);
      group.add(treeLeft);
      treeIndex++;

      const treeRight = trees[treeIndex % trees.length].clone();
      treeRight.position.set(SIDEWALK_CURB_TREE_X, 0.0, z);
      treeRight.scale.setScalar(TREE_SCALE);
      treeRight.rotation.y = (z * 1.3) % (Math.PI * 2);
      group.add(treeRight);
      treeIndex++;
    }
  }
}
