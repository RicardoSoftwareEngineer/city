Loft furniture/decor catalog extracted from loft_5_interior_for_free (Sketchfab free).

Pieces (no architecture):
  sofa    = node_0       grey L-sectional + orange pillows (Material.005) — NOT node_0.003
  chair   = node_0.001   leather lounge chair
  coffee  = Cube.008     wood-slat top + black metal base (was wrongly "lamp")
  console = node_0.002   rustic wood media console
  bar     = node_0.003   glass-front display cabinet (+ baked dome lamp/decor)
  plant   = node_0.004   leafy plant in white pot
  tray    = node_0.005   small decor tray (candle/bottles)
  wallart = Cube.007     skull pixel painting canvas
  rug     = Plane.003    mottled grey area rug

Skipped architecture: Cube–Cube.005, Plane/Plane.001/002/004–006, Point lights, Cube.006 beam.
No separable floor lamp — the dome lamp is part of `bar`.

Albedo: default ≤512 JPEG q90; sofa+bar atlases 1024 PNG. Each piece floored (minY=0),
XZ-centered, Y-up (FBX Z-up parents corrected with Rx(-90) at extract). Placement is yaw-only.

Re-extract: `node scripts/extract-loft-furniture.mjs` (needs sharp + @gltf-transform;
source GLB at LOFT_SRC, default /workspace/uploads/loft_5_interior_for_free.glb).

Sandbox + rooms load this file with ?v=full-catalog-1.
Street catalog exposes every piece (CATALOG_NAMES). Mass InstancedMesh bake in roomTemplate.js
uses a living-room subset (sofa/chair/coffee/console/bar/plant/rug/wallart).
