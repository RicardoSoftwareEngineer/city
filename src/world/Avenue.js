/**
 * Avenue — Asphalt, lane markings, curb stripes, and road decals.
 *
 * T-junction at the origin: main avenue along +Z, cross street along X.
 * No road south of the intersection.
 */

import * as THREE from 'three';
import { loadGltf } from './AssetLoader.js';
import { downtown } from './downtownSrc.js';
import {
  AVENUE_START_Z,
  AVENUE_END_Z,
  ASPHALT_TILE_SIZE,
  SIDEWALK_TILE_SIZE,
  SIDEWALK_CENTER_X
} from './RoadDimensions.js';

const ASSET_PATHS = {
  asphalt:    downtown('Street_Asphalt_6x6.gltf'),
  brokenLine: downtown('Decal_BrokenLine_Straight.gltf'),
  stripe:     downtown('Sidewalk_Straight_3m_Stripe.gltf'),
  decalSlow:  downtown('Decal_Slow.gltf'),
  decalOnly:  downtown('Decal_Only.gltf'),
  decalStop:  downtown('Decal_Stop.gltf'),
  decalArrow: downtown('Decal_ArrowStraight.gltf')
};

export class Avenue {
  async build(parentGroup) {
    const [asphalt, brokenLine, stripe, decalSlow, decalOnly, decalStop, decalArrow] = await Promise.all([
      loadGltf(ASSET_PATHS.asphalt),
      loadGltf(ASSET_PATHS.brokenLine),
      loadGltf(ASSET_PATHS.stripe),
      loadGltf(ASSET_PATHS.decalSlow),
      loadGltf(ASSET_PATHS.decalOnly),
      loadGltf(ASSET_PATHS.decalStop),
      loadGltf(ASSET_PATHS.decalArrow)
    ]);

    if (asphalt) {
      this.buildAsphaltRoad(parentGroup, asphalt);
      this.buildCrossStreets(parentGroup, asphalt);
    }

    if (brokenLine) this.buildCenterLine(parentGroup, brokenLine);
    if (stripe)     this.buildCurbStripes(parentGroup, stripe);

    this.placeDecals(parentGroup, { decalSlow, decalOnly, decalStop, decalArrow });
  }

  buildAsphaltRoad(group, asphalt) {
    for (let z = AVENUE_START_Z; z <= AVENUE_END_Z; z += ASPHALT_TILE_SIZE) {
      const left = asphalt.clone();
      left.position.set(-3, 0, z);
      group.add(left);

      const right = asphalt.clone();
      right.position.set(3, 0, z);
      group.add(right);
    }
  }

  buildCrossStreets(group, asphalt) {
    for (let x = -12; x >= -48; x -= ASPHALT_TILE_SIZE) {
      const top = asphalt.clone();
      top.position.set(x, 0, -3);
      group.add(top);

      const bottom = asphalt.clone();
      bottom.position.set(x, 0, 3);
      group.add(bottom);
    }

    for (let x = 12; x <= 48; x += ASPHALT_TILE_SIZE) {
      const top = asphalt.clone();
      top.position.set(x, 0, -3);
      group.add(top);

      const bottom = asphalt.clone();
      bottom.position.set(x, 0, 3);
      group.add(bottom);
    }
  }

  buildCenterLine(group, brokenLine) {
    for (let z = 14; z <= 240; z += ASPHALT_TILE_SIZE) {
      const line = brokenLine.clone();
      line.position.set(0, 0.015, z);
      line.rotation.y = Math.PI / 2;
      group.add(line);
    }

    for (let x = -14; x >= -40; x -= ASPHALT_TILE_SIZE) {
      const line = brokenLine.clone();
      line.position.set(x, 0.015, 0);
      group.add(line);
    }

    for (let x = 14; x <= 40; x += ASPHALT_TILE_SIZE) {
      const line = brokenLine.clone();
      line.position.set(x, 0.015, 0);
      group.add(line);
    }
  }

  buildCurbStripes(group, stripe) {
    for (let z = 10.5; z <= AVENUE_END_Z; z += SIDEWALK_TILE_SIZE) {
      const left = stripe.clone();
      left.position.set(-SIDEWALK_CENTER_X, 0.0, z);
      left.rotation.y = Math.PI / 2;
      group.add(left);

      const right = stripe.clone();
      right.position.set(SIDEWALK_CENTER_X, 0.0, z);
      right.rotation.y = -Math.PI / 2;
      group.add(right);
    }

    for (let x = -10.5; x >= -40.5; x -= SIDEWALK_TILE_SIZE) {
      const north = stripe.clone();
      north.position.set(x, 0.0, SIDEWALK_CENTER_X);
      north.rotation.y = Math.PI;
      group.add(north);

      const south = stripe.clone();
      south.position.set(x, 0.0, -SIDEWALK_CENTER_X);
      south.rotation.y = 0;
      group.add(south);
    }
    for (let x = 10.5; x <= 40.5; x += SIDEWALK_TILE_SIZE) {
      const north = stripe.clone();
      north.position.set(x, 0.0, SIDEWALK_CENTER_X);
      north.rotation.y = Math.PI;
      group.add(north);

      const south = stripe.clone();
      south.position.set(x, 0.0, -SIDEWALK_CENTER_X);
      south.rotation.y = 0;
      group.add(south);
    }
  }

  placeDecals(group, { decalSlow, decalOnly, decalStop, decalArrow }) {
    if (decalSlow) {
      const slow = decalSlow.clone();
      slow.position.set(3.0, 0.025, 14.5);
      slow.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.color = new THREE.Color(0xfacc15);
        }
      });
      group.add(slow);
    }

    if (decalOnly) {
      const only = decalOnly.clone();
      only.position.set(-3.0, 0.025, 14.5);
      only.rotation.y = Math.PI;
      group.add(only);
    }

    if (decalArrow) {
      const arrow = decalArrow.clone();
      arrow.position.set(-3.0, 0.025, 21.0);
      arrow.rotation.y = Math.PI;
      group.add(arrow);
    }

    if (decalStop) {
      const stop = decalStop.clone();
      stop.position.set(3.0, 0.025, 80);
      stop.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.color = new THREE.Color(0xfacc15);
        }
      });
      group.add(stop);
    }
  }
}
