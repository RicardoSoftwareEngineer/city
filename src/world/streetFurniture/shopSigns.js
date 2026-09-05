/**
 * Shop signs + awnings + entrances.
 * MAP hotspot: each Prop_Sign_*.gltf is a unique parse (textures restored).
 * JadeGarden alone is four files (main + vertical + L/R sides).
 */
import { east, north, south, west } from './faces.js';

export function placeShopKits(add, xs, zs) {
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
