Loft furniture shortlist extracted from loft_5_interior_for_free (Sketchfab free).
Sofa/plant/console/lamp/chair — no architecture. Albedo: default ≤512 JPEG q90;
sofa Material.012 atlas at 1024 PNG (+ mild brighten) so dark fabric reads as cushions
under MeshBasic outdoors (256 JPEG previously crushed it into a black “chassis”).
Each piece is floored (minY=0), XZ-centered, Y-up. FBX Z-up meshes (plant/lamp/chair/console)
are corrected with Rx(-90) at extract time; sofa stays local Y-up. Placement is yaw-only.

Coffee: Cube.007 in the loft GLB is wall-art canvas (skull albedo), not a table — omitted
from this shortlist. roomTemplate / sandbox use a wood box top + metal legs instead.

Re-extract: `node scripts/extract-loft-furniture.mjs` (needs sharp + @gltf-transform;
source GLB at LOFT_SRC, default /workspace/uploads/loft_5_interior_for_free.glb).

Note: chair AABB can still read Z-tall after extract — the apt example sandbox
(src/world/apartments/aptExampleSandbox.js) re-normalizes tallest→Y at load time.
Sandbox + rooms load this file with ?v=sofa-albedo-5 (hard-refresh if the browser caches).
Street catalog: sofa/plant/console/lamp/chair (no coffee sample). Sofa: Y-up + DoubleSide
MeshBasic with lifted albedo multiply (not flat/black chassis).
Mass InstancedMesh bake remains in roomTemplate.js (product path).
