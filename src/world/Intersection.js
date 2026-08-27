/**
 * Intersection — Corner number markers at the origin T-junction.
 *
 * The intersection mesh itself is placed by CityGrid.
 *
 *   [1] Front-Left  (X = -7.5, Z = +7.5) — Blue
 *   [2] Front-Right (X = +7.5, Z = +7.5) — Orange
 *   [3] Back-Left   (X = -7.5, Z = -7.5) — Green
 *   [4] Back-Right  (X = +7.5, Z = -7.5) — Red
 */

import * as THREE from 'three';

export class Intersection {
  async build(parentGroup) {
    this.placeCornerNumberMarkers(parentGroup);
  }

  placeCornerNumberMarkers(group) {
    const corners = [
      { number: 1, label: '1 - Frente Esquerda', x: -7.5, z:  7.5, color: '#3b82f6' }, // Blue
      { number: 2, label: '2 - Frente Direita',  x:  7.5, z:  7.5, color: '#f97316' }, // Orange
      { number: 3, label: '3 - Trás Esquerda',   x: -7.5, z: -7.5, color: '#22c55e' }, // Green
      { number: 4, label: '4 - Trás Direita',    x:  7.5, z: -7.5, color: '#ef4444' }  // Red
    ];

    for (const c of corners) {
      const markerGroup = new THREE.Group();

      // 1. Ground circular decal on the sidewalk
      const groundCanvas = document.createElement('canvas');
      groundCanvas.width = 512;
      groundCanvas.height = 512;
      const ctx = groundCanvas.getContext('2d');

      // Outer circle
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(256, 256, 230, 0, Math.PI * 2);
      ctx.fill();

      // White inner border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(256, 256, 210, 0, Math.PI * 2);
      ctx.stroke();

      // Big Number
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 280px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.number), 256, 260);

      const groundTexture = new THREE.CanvasTexture(groundCanvas);
      const groundDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.2),
        new THREE.MeshBasicMaterial({
          map: groundTexture,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -4
        })
      );
      groundDisc.rotation.x = -Math.PI / 2;
      groundDisc.position.y = 0.03;
      markerGroup.add(groundDisc);

      // 2. Floating 3D Number Totem (visible from high & low camera angles)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8 })
      );
      pole.position.y = 1.4;
      markerGroup.add(pole);

      // Glowing Badge Box on top
      const boxCanvas = document.createElement('canvas');
      boxCanvas.width = 256;
      boxCanvas.height = 256;
      const bCtx = boxCanvas.getContext('2d');
      bCtx.fillStyle = c.color;
      bCtx.fillRect(0, 0, 256, 256);
      bCtx.strokeStyle = '#ffffff';
      bCtx.lineWidth = 16;
      bCtx.strokeRect(8, 8, 240, 240);
      bCtx.fillStyle = '#ffffff';
      bCtx.font = 'bold 160px "Outfit", sans-serif';
      bCtx.textAlign = 'center';
      bCtx.textBaseline = 'middle';
      bCtx.fillText(String(c.number), 128, 130);

      const boxTexture = new THREE.CanvasTexture(boxCanvas);
      const badgeBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({
          map: boxTexture,
          roughness: 0.2
        })
      );
      badgeBox.position.y = 3.1;
      markerGroup.add(badgeBox);

      markerGroup.position.set(c.x, 0, c.z);
      group.add(markerGroup);
    }
  }
}
