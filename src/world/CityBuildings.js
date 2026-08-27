/**
 * Places the 7 building templates with InstancedMesh.
 *
 * Each template is already merged by material, so the GPU draws one
 * instance batch per material per type — not one draw per window.
 */

import * as THREE from 'three';
import { SIDEWALK_EDGE, GRID_STREET_COUNT, gridStreetCoords } from './RoadDimensions.js';
import { getBuildingTemplate } from './buildings/catalog.js';
import { BUILDING_SPECS } from './buildings/specs.js';

const TYPE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#eab308', '#06b6d4', '#ef4444'];

export class CityBuildings {
  collectPlacements() {
    const xs = gridStreetCoords();
    const zs = gridStreetCoords();
    const placements = [];
    let n = 0;
    const typeCount = BUILDING_SPECS.length;

    for (let i = 0; i < GRID_STREET_COUNT - 1; i++) {
      for (let j = 0; j < GRID_STREET_COUNT - 1; j++) {
        const xMid = (xs[i] + xs[i + 1]) / 2;
        const zMid = (zs[j] + zs[j + 1]) / 2;
        const west = xs[i] + SIDEWALK_EDGE;
        const east = xs[i + 1] - SIDEWALK_EDGE;
        const south = zs[j] + SIDEWALK_EDGE;
        const north = zs[j + 1] - SIDEWALK_EDGE;

        const bankCorner = i === 0 && j === 0;
        const faces = [
          { type: n++ % typeCount, x: xMid, z: south, rot: 0, skip: bankCorner },
          { type: n++ % typeCount, x: xMid, z: north, rot: Math.PI, skip: false },
          { type: n++ % typeCount, x: west, z: zMid, rot: Math.PI / 2, skip: bankCorner },
          { type: n++ % typeCount, x: east, z: zMid, rot: -Math.PI / 2, skip: false }
        ];
        for (const face of faces) {
          if (!face.skip) placements.push(face);
        }
      }
    }
    return placements;
  }

  register(stream, parentGroup, physicsWorld) {
    const placements = this.collectPlacements();
    const sprites = BUILDING_SPECS.map((spec, index) =>
      this.createNumberSprite(spec.id, TYPE_COLORS[index % TYPE_COLORS.length])
    );

    for (let type = 0; type < BUILDING_SPECS.length; type++) {
      const ofType = placements.filter((p) => p.type === type);
      stream.addBuilding({
        placements: ofType,
        heavy: BUILDING_SPECS[type].name.startsWith('Large'),
        load: () => getBuildingTemplate(type),
        onReveal: (p, template) => {
          this.addCollider(physicsWorld, template, p);
          this.addTypeLabel(parentGroup, sprites[type], template, p);
        }
      });
    }
  }

  addCollider(physicsWorld, template, p) {
    if (!physicsWorld) return;
    const { width, depth, height, centerZ } = template.userData.collider;
    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    const cx = p.x + sin * centerZ;
    const cz = p.z + cos * centerZ;
    const alongX = Math.abs(cos) > 0.5 ? width / 2 : depth / 2;
    const alongZ = Math.abs(cos) > 0.5 ? depth / 2 : width / 2;
    physicsWorld.addStaticBox(cx, 0, cz, alongX, height / 2, alongZ);
  }

  addTypeLabel(parentGroup, sprite, template, p) {
    const { height, centerZ } = template.userData.collider;
    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    const marker = sprite.clone();
    marker.position.set(
      p.x + sin * centerZ,
      height + 2.5,
      p.z + cos * centerZ
    );
    parentGroup.add(marker);
  }

  createNumberSprite(number, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 140px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 128, 138);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: true, sizeAttenuation: true })
    );
    sprite.scale.set(5, 5, 1);
    sprite.renderOrder = 2;
    return sprite;
  }
}
