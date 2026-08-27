/**
 * VehicleController — Cannon-es RaycastVehicle wired to keyboard input.
 *
 * Creates the chassis physics body, attaches 4 wheels with calibrated
 * suspension, and applies engine force / steering / braking each frame
 * based on KeyboardInput state.
 *
 * Also synchronizes the PorscheModel visual mesh to the physics body
 * and updates wheel spin/steer animations.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import {
  PORSCHE_SPAWN_Y,
  PORSCHE_WHEEL_RADIUS,
  PORSCHE_HALF_TRACK,
  PORSCHE_FRONT_AXLE_Z,
  PORSCHE_REAR_AXLE_Z
} from '../world/RoadDimensions.js';

const MAX_ENGINE_FORCE = 3500;
const MAX_STEER_ANGLE  = 0.45;
const MAX_BRAKE_FORCE  = 150;

export class VehicleController {
  constructor(physicsWorld, porscheModel, keyboard) {
    this.physicsWorld = physicsWorld;
    this.porscheModel = porscheModel;
    this.keyboard = keyboard;
    this.wheelSpinAngle = 0;

    // Chassis body
    this.chassisBody = new CANNON.Body({ mass: 450 });
    this.chassisBody.addShape(
      new CANNON.Box(new CANNON.Vec3(1.1, 0.35, 2.1)),
      new CANNON.Vec3(0, 0.35, 0)
    );
    this.chassisBody.position.set(0, PORSCHE_SPAWN_Y, 4.0);
    this.chassisBody.angularDamping = 0.5;
    physicsWorld.world.addBody(this.chassisBody);

    // Raycast vehicle
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });

    this.addWheels();
    this.vehicle.addToWorld(physicsWorld.world);
  }

  addWheels() {
    const options = {
      radius: PORSCHE_WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 50,
      suspensionRestLength: 0.55,
      frictionSlip: 3.5,
      dampingRelaxation: 2.5,
      dampingCompression: 4.5,
      maxSuspensionForce: 100000,
      rollInfluence: 0.02,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.5,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true
    };

    const connectionY = 0.0;

    // Front left, front right
    options.chassisConnectionPointLocal.set(-PORSCHE_HALF_TRACK, connectionY, PORSCHE_FRONT_AXLE_Z);
    this.vehicle.addWheel(options);
    options.chassisConnectionPointLocal.set(PORSCHE_HALF_TRACK, connectionY, PORSCHE_FRONT_AXLE_Z);
    this.vehicle.addWheel(options);

    // Rear left, rear right
    options.chassisConnectionPointLocal.set(-PORSCHE_HALF_TRACK, connectionY, PORSCHE_REAR_AXLE_Z);
    this.vehicle.addWheel(options);
    options.chassisConnectionPointLocal.set(PORSCHE_HALF_TRACK, connectionY, PORSCHE_REAR_AXLE_Z);
    this.vehicle.addWheel(options);
  }

  resetPosition() {
    this.applyPose({ x: 0, y: PORSCHE_SPAWN_Y, z: 4.0, qx: 0, qy: 0, qz: 0, qw: 1 });
  }

  applyPose(pose) {
    this.chassisBody.position.set(pose.x, pose.y, pose.z);
    this.chassisBody.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.wakeUp();
  }

  /**
   * Read keyboard and apply physics forces.  Call once per frame.
   */
  update(delta) {
    // ── Input ──────────────────────────────────────────────────────────
    let engineForce = 0;
    let steer = 0;
    let brake = 0;

    if (this.keyboard.isPressed('KeyW') || this.keyboard.isPressed('ArrowUp'))    engineForce = -MAX_ENGINE_FORCE;
    if (this.keyboard.isPressed('KeyS') || this.keyboard.isPressed('ArrowDown'))  engineForce = MAX_ENGINE_FORCE * 0.7;
    if (this.keyboard.isPressed('KeyA') || this.keyboard.isPressed('ArrowLeft'))  steer = MAX_STEER_ANGLE;
    if (this.keyboard.isPressed('KeyD') || this.keyboard.isPressed('ArrowRight')) steer = -MAX_STEER_ANGLE;
    if (this.keyboard.isPressed('Space')) brake = MAX_BRAKE_FORCE;
    if (this.keyboard.isPressed('KeyR'))  this.resetPosition();

    // Apply to all 4 wheels (AWD)
    for (let i = 0; i < 4; i++) {
      this.vehicle.applyEngineForce(engineForce * 0.5, i);
      this.vehicle.setBrake(brake, i);
    }
    // Front wheels steer
    this.vehicle.setSteeringValue(steer, 0);
    this.vehicle.setSteeringValue(steer, 1);

    // ── Sync visual mesh to physics body ──────────────────────────────
    const mesh = this.porscheModel.chassisGroup;
    mesh.position.copy(this.chassisBody.position);
    mesh.quaternion.copy(this.chassisBody.quaternion);

    // ── Update wheel visuals ──────────────────────────────────────────
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i);
    }

    const speed = this.chassisBody.velocity.length();
    const isReverse = this.chassisBody.velocity.dot(new CANNON.Vec3(0, 0, 1)) < -0.1;
    this.wheelSpinAngle += (isReverse ? -speed : speed) * delta * 2.8;

    const steerAngle = this.vehicle.wheelInfos[0].steering;
    this.porscheModel.updateWheels(steerAngle, this.wheelSpinAngle);

    return speed; // Return speed for HUD
  }
}
