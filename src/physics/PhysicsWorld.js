/**
 * PhysicsWorld — Cannon-es physics simulation.
 *
 * Creates the CANNON.World with gravity, broadphase, and a static ground
 * box whose top surface sits exactly at ASPHALT_SURFACE_Y (-0.150 m).
 */

import * as CANNON from 'cannon-es';
import {
  ASPHALT_SURFACE_Y,
  GROUND_BODY_HALF,
  GROUND_BODY_DEPTH,
  cityBounds
} from '../world/RoadDimensions.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.friction = 0.3;

    this.createGroundPlane();
    // Passo 1 open map: do not create the 4 invisible city perimeter walls.
    // this.createCityPerimeter();
  }

  createGroundPlane() {
    const shape = new CANNON.Box(
      new CANNON.Vec3(GROUND_BODY_HALF, GROUND_BODY_DEPTH, GROUND_BODY_HALF)
    );
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape,
      position: new CANNON.Vec3(0, ASPHALT_SURFACE_Y - GROUND_BODY_DEPTH, 0),
      material: new CANNON.Material('ground')
    });
    this.world.addBody(body);
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

  step(delta) {
    this.world.step(1 / 60, delta, 3);
  }
}
