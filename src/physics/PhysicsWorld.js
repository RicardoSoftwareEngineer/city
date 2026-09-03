/**
 * PhysicsWorld — Cannon-es physics simulation.
 *
 * Creates the CANNON.World with gravity, broadphase, and a static ground
 * box whose top surface sits exactly at ASPHALT_SURFACE_Y (-0.150 m).
 * Passo 2: city ground covers only cityBounds (+pad); countryside uses
 * per-tile Heightfield colliders (see TerrainWorld).
 */

import * as CANNON from 'cannon-es';
import {
  ASPHALT_SURFACE_Y,
  GROUND_BODY_HALF,
  GROUND_BODY_DEPTH,
  cityBounds
} from '../world/RoadDimensions.js';

/** Extra meters beyond cityBounds for the flat asphalt ground box. */
const CITY_GROUND_PAD = 3;

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.friction = 0.3;

    this.groundMaterial = new CANNON.Material('ground');

    this.createGroundPlane();
    // Soft outer fence so the car does not free-fall past ±GROUND_BODY_HALF.
    this.createOuterFence();
    // Passo 1 open map: do not create the 4 invisible city perimeter walls.
    // this.createCityPerimeter();
  }

  /**
   * Flat box under the city streets only (not the hills).
   * Top face at ASPHALT_SURFACE_Y.
   */
  createGroundPlane() {
    const b = cityBounds();
    const halfX = (b.maxX - b.minX) * 0.5 + CITY_GROUND_PAD;
    const halfZ = (b.maxZ - b.minZ) * 0.5 + CITY_GROUND_PAD;
    const cx = (b.minX + b.maxX) * 0.5;
    const cz = (b.minZ + b.maxZ) * 0.5;

    const shape = new CANNON.Box(
      new CANNON.Vec3(halfX, GROUND_BODY_DEPTH, halfZ)
    );
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      position: new CANNON.Vec3(cx, ASPHALT_SURFACE_Y - GROUND_BODY_DEPTH, cz),
      material: this.groundMaterial
    });
    this.world.addBody(body);
  }

  /**
   * Low walls around the ±GROUND_BODY_HALF playable square (void follow-up
   * if respawn is needed later).
   */
  createOuterFence() {
    const half = GROUND_BODY_HALF;
    const thick = 4;
    // Tall enough that distant peaks (~150 m) do not toss the car over the rim.
    const halfH = 80;
    const y = ASPHALT_SURFACE_Y;
    this.addStaticBox(0, y, -half - thick, half + thick * 2, halfH, thick);
    this.addStaticBox(0, y, half + thick, half + thick * 2, halfH, thick);
    this.addStaticBox(-half - thick, y, 0, thick, halfH, half);
    this.addStaticBox(half + thick, y, 0, thick, halfH, half);
  }

  /**
   * Invisible walls around the 4×4 neighborhood so the car cannot drive
   * onto the empty ground beyond the last street.
   */
  createCityPerimeter() {
    const b = cityBounds();
    const thick = 8;
    const halfH = 8;
    const midX = (b.minX + b.maxX) * 0.5;
    const midZ = (b.minZ + b.maxZ) * 0.5;
    const spanX = (b.maxX - b.minX) * 0.5 + thick;
    const spanZ = (b.maxZ - b.minZ) * 0.5 + thick;
    const y = ASPHALT_SURFACE_Y;

    this.addStaticBox(b.minX - thick, y, midZ, thick, halfH, spanZ);
    this.addStaticBox(b.maxX + thick, y, midZ, thick, halfH, spanZ);
    this.addStaticBox(midX, y, b.minZ - thick, spanX, halfH, thick);
    this.addStaticBox(midX, y, b.maxZ + thick, spanX, halfH, thick);
  }

  /**
   * Add a static box collider (used for buildings, walls, etc).
   */
  addStaticBox(x, y, z, halfWidth, halfHeight, halfDepth) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(halfWidth, halfHeight, halfDepth)),
      position: new CANNON.Vec3(x, y + halfHeight, z)
    });
    this.world.addBody(body);
  }

  /**
   * Static Heightfield for one countryside tile (Passo 2).
   * matrix[i][j] = world Y; body oriented so Y is up (see TerrainWorld).
   */
  addHeightfield(matrix, elementSize, position, quaternion) {
    const shape = new CANNON.Heightfield(matrix, { elementSize });
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.groundMaterial
    });
    body.addShape(shape);
    body.position.copy(position);
    body.quaternion.copy(quaternion);
    this.world.addBody(body);
    return body;
  }

  step(delta) {
    this.world.step(1 / 60, delta, 3);
  }
}
