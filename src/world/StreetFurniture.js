/**
 * StreetFurniture — orchestrates downtown stairs, shop signs, props, roads.
 * Placement lives in ./streetFurniture/* so MAP hitches (signs, rails) are
 * easy to find and optimize one module at a time.
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
import { collectStreetlightPoses, createStreetlightModel } from './streetFurniture/streetlight.js';

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

    placeStairs(add, xs, zs);
    placeShopKits(add, xs, zs);
    placeFireEscapes(add, xs, zs);
    placeStreetProps(add, xs, zs);
    placePlanterRows(add, xs, zs);
    placeExtraRoads(add, xs, zs);
    return {
      jobs,
      streetlightPoses: collectStreetlightPoses(xs, zs),
      streetlightTemplate: createStreetlightModel()
    };
  }
}
