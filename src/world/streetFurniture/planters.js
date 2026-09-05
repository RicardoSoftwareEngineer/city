export function placePlanterRows(add, xs, zs) {
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
