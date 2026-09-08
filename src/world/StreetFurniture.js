/**
 * StreetFurniture — orchestrates downtown stairs, shop signs, props, roads.
 * Placement lives in ./streetFurniture/* so MAP hitches (signs, rails) are
 * easy to find and optimize one module at a time.
 *
 * Jobs are merged by glTF URL + shadow opts + priority so keys that share a
 * file (awning / awningBakery / awningPub → Prop_Awning.gltf) parse once and
 * share one instancer / GPU program warm — avoids repeated MAP parse+compile.
 *
 * Street lamps use a single Quaternius/CC0 GLB (not MegaKit downtown files).
 */

import { gridStreetCoords } from './RoadDimensions.js';
import { downtown } from './downtownSrc.js';
import { noCastOpts, castOpts } from './shadowPolicy.js';
import { CAST_KEYS, FILES } from './streetFurniture/files.js';
import { placeStairs } from './streetFurniture/stairs.js';
import { placeShopKits } from './streetFurniture/shopSigns.js';
import { placeFireEscapes } from './streetFurniture/fireEscapes.js';
import { placeStreetProps } from './streetFurniture/streetProps.js';
import { placePlanterRows } from './streetFurniture/planters.js';
import { placeExtraRoads } from './streetFurniture/extraRoads.js';
import {
  collectStreetlightPoses,
  STREETLIGHT_URL,
  prepareStreetlightTemplate
} from './streetFurniture/streetlight.js';

function optsKey(options) {
  return `c${options.castShadow ? 1 : 0}|r${options.receiveShadow ? 1 : 0}|vc${options.keepVertexColors ? 1 : 0}`;
}

export class StreetFurniture {
  collectJobs() {
    const xs = gridStreetCoords();
    const zs = gridStreetCoords();
    const jobs = [];
    const byUrl = new Map();

    const add = (key, poses, priority = 1) => {
      if (!poses?.length || !FILES[key]) return;
      const url = downtown(FILES[key]);
      const options = CAST_KEYS.has(key) ? castOpts() : noCastOpts();
      const mergeKey = `${url}|${optsKey(options)}|p${priority}`;
      const existing = byUrl.get(mergeKey);
      if (existing) {
        for (let i = 0; i < poses.length; i++) existing.poses.push(poses[i]);
        return;
      }
      const job = { url, poses: poses.slice(), options, priority };
      byUrl.set(mergeKey, job);
      jobs.push(job);
    };

    placeStairs(add, xs, zs);
    placeShopKits(add, xs, zs);
    placeFireEscapes(add, xs, zs);
    placeStreetProps(add, xs, zs);
    placePlanterRows(add, xs, zs);
    placeExtraRoads(add, xs, zs);

    const streetlightPoses = collectStreetlightPoses(xs, zs);
    if (streetlightPoses.length) {
      jobs.push({
        url: STREETLIGHT_URL,
        poses: streetlightPoses,
        options: {
          ...castOpts(),
          prepare: prepareStreetlightTemplate
        },
        priority: 1
      });
    }

    return {
      jobs,
      streetlightPoses
    };
  }
}
