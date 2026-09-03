/**
 * Shared foliage wind (Passo 4 + 12).
 * applyWind clones/mutates a material with onBeforeCompile: primary sin wave
 * + slow uGust second sine. Bend scales with local position.y > 0.
 * tickWind(elapsed) updates every registered uniform — call from main.js.
 * Do not import Godot/Unity shaders.
 */

import * as THREE from 'three';

const windUniforms = [];

/**
 * Inject a simple bend into a MeshStandard / MeshLambert material.
 * @param {THREE.Material} material
 * @param {{ strength?: number, gust?: number }} [opts]
 * @returns {THREE.Material} the material (mutated, same instance)
 */
export function applyWind(material, opts = {}) {
  if (!material || material.userData._windApplied) return material;

  const strength = opts.strength ?? 0.25;
  const gust = opts.gust ?? 0.35;
  const uTime = { value: 0 };
  const uWindStrength = { value: strength };
  const uGust = { value: gust };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWindStrength = uWindStrength;
    shader.uniforms.uGust = uGust;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWindStrength;
uniform float uGust;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float bend = max(transformed.y, 0.0);
  float phase = (transformed.x + transformed.z) * 0.35 + uTime * 1.4;
  float primary = sin(phase);
  float gustWave = sin(uTime * 0.37 + phase * 0.22);
  float w = (primary + gustWave * uGust) * bend * uWindStrength;
  transformed.x += w;
  transformed.z += w * 0.6;
}`
      );
  };
  material.userData._windApplied = true;
  material.userData._windUTime = uTime;
  material.needsUpdate = true;
  windUniforms.push(uTime);
  return material;
}

/** Traverse an Object3D and apply wind to every mesh material. */
export function applyWindToObject(root, opts = {}) {
  if (!root) return root;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((m) => applyWind(m, opts));
    child.material = Array.isArray(child.material) ? next : next[0];
  });
  return root;
}

/** Update all registered wind shader uniforms. Call once per frame. */
export function tickWind(elapsed) {
  for (let i = 0; i < windUniforms.length; i++) {
    windUniforms[i].value = elapsed;
  }
}
