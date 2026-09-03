import { CityGrid } from './CityGrid.js';
import { StreetFurniture } from './StreetFurniture.js';
import { CityBuildings } from './CityBuildings.js';
import { BankBuilding } from './BankBuilding.js';
import { chebyshev } from './instancing.js';
import { STREAM_STEP, WorldStream } from './WorldStream.js';
import { castOpts } from './shadowPolicy.js';
import { registerTerrain } from './terrain/TerrainWorld.js';

function distToAabb(ox, oz, minX, maxX, minZ, maxZ) {
  const x = Math.min(Math.max(ox, minX), maxX);
  const z = Math.min(Math.max(oz, minZ), maxZ);
  return chebyshev(ox, oz, x, z);
}

export { STREAM_STEP };

export function createCityStream(parentGroup, physicsWorld, ox, oz, renderer) {
  const stream = new WorldStream(parentGroup, ox, oz, renderer);
  const grid = new CityGrid();

  for (const job of grid.collectJobs()) {
    stream.addUrl(job.url, job.poses, job.options, job.priority);
  }

  stream.addTask({
    dist: chebyshev(3, 14.5, ox, oz),
    priority: 1,
    run: grid.collectOriginDecalTask(parentGroup)
  });

  const furniture = new StreetFurniture().collectJobs();
  for (const job of furniture.jobs) {
    stream.addUrl(job.url, job.poses, job.options, job.priority);
  }
  stream.addTemplate(furniture.streetlightTemplate, furniture.streetlightPoses, castOpts(), 1);

  stream.addTask({
    dist: distToAabb(ox, oz, 9, 25, 9, 33),
    priority: 2,
    run: () => new BankBuilding().build(parentGroup, physicsWorld, renderer)
  });

  new CityBuildings().register(stream, parentGroup, physicsWorld);
  registerTerrain(stream, parentGroup, ox, oz, physicsWorld);
  return stream;
}
