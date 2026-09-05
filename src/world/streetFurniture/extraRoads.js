export function placeExtraRoads(add, xs, zs) {
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
