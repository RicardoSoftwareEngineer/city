import { CityGrid } from './CityGrid.js';
import { StreetFurniture } from './StreetFurniture.js';
import { CityBuildings } from './CityBuildings.js';
import { BankBuilding } from './BankBuilding.js';
import { chebyshev } from './instancing.js';
import { STREAM_STEP, WorldStream } from './WorldStream.js';
import { castOpts } from './shadowPolicy.js';
import { registerTerrain } from './terrain/TerrainWorld.js';
import { registerVegetation } from './terrain/Vegetation.js';
import { registerLakes } from './water/registerLakes.js';
import { registerCountryAvenue } from './terrain/countryAvenue.js';
import { yieldToMain } from './yield.js';

function distToAabb(ox, oz, minX, maxX, minZ, maxZ) {
  const x = Math.min(Math.max(ox, minX), maxX);
  const z = Math.min(Math.max(oz, minZ), maxZ);
  return chebyshev(ox, oz, x, z);
}

export { STREAM_STEP };

/**
 * Light registration only (streets / furniture / buildings / terrain tasks).
 * Vegetation + avenue + lakes are huge sync scatters — call registerHeavyWorld
 * later so "Começar a carregar" does not freeze the tab.
 */
export async function createCityStream(parentGroup, physicsWorld, ox, oz, renderer) {
  const stream = new WorldStream(parentGroup, ox, oz, renderer);
  const grid = new CityGrid();

  await yieldToMain();
  const gridJobs = grid.collectJobs();
  for (let i = 0; i < gridJobs.length; i++) {
    const job = gridJobs[i];
    stream.addUrl(job.url, job.poses, job.options, job.priority);
    if (i > 0 && i % 8 === 0) await yieldToMain();
  }

  stream.addTask({
    dist: chebyshev(3, 14.5, ox, oz),
    priority: 1,
    run: grid.collectOriginDecalTask(parentGroup)
  });
  await yieldToMain();

  const furniture = new StreetFurniture().collectJobs();
  for (let i = 0; i < furniture.jobs.length; i++) {
    const job = furniture.jobs[i];
    stream.addUrl(job.url, job.poses, job.options, job.priority);
    if (i > 0 && i % 8 === 0) await yieldToMain();
  }
  stream.addTemplate(furniture.streetlightTemplate, furniture.streetlightPoses, castOpts(), 1);
  await yieldToMain();

  stream.addTask({
    dist: distToAabb(ox, oz, 9, 25, 9, 33),
    priority: 2,
    run: () => new BankBuilding().build(parentGroup, physicsWorld, renderer)
  });

  new CityBuildings().register(stream, parentGroup, physicsWorld);
  await yieldToMain();

  registerTerrain(stream, parentGroup, ox, oz, physicsWorld);
  await yieldToMain();

  return stream;
}

/** Scatter-heavy layers — run after the first street ring has started. */
export async function registerHeavyWorld(stream, parentGroup, ox, oz, scene) {
  await yieldToMain();
  await registerVegetation(stream, parentGroup, ox, oz);
  await yieldToMain();
  registerCountryAvenue(stream, parentGroup, ox, oz);
  await yieldToMain();
  registerLakes(stream, parentGroup, ox, oz, scene);
  await yieldToMain();
}
