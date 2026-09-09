Loft + novopo furniture/decor catalogs (Sketchfab free interiors).

── loft_furniture.glb (loft_5_interior_for_free)
Pieces (no architecture):
  sofa    = node_0       grey L-sectional + orange pillows (Material.005) — NOT node_0.003
  chair   = node_0.001   leather sling lounge (Y-up; depth may exceed height)
  coffee  = Cube.008     wood-slat top + black metal base (was wrongly "lamp")
  console = node_0.002   rustic wood media console
  bar     = node_0.003   glass-front display cabinet (+ baked dome lamp/decor)
  plant   = node_0.004   leafy plant in white pot
  tray    = node_0.005   small decor tray (candle/bottles)
  wallart = Cube.007     skull pixel painting canvas
  rug     = Plane.003    mottled grey area rug

Skipped architecture: Cube–Cube.005, Plane/Plane.001/002/004–006, Point lights, Cube.006 beam.
No separable floor lamp — the dome lamp is part of `bar`.

Re-extract: `node scripts/extract-loft-furniture.mjs` (needs sharp + @gltf-transform;
source GLB at LOFT_SRC, default /workspace/uploads/loft_5_interior_for_free.glb).

── novopo_furniture.glb (loft_japanese_11_free_interior)
Pieces (prefix jp_; deduped identical siblings):
  jp_cushion       = node_0          olive floor cushion (001–004 identical)
  jp_tea_set       = node_0.005      ornate tea table + ceramic set
  jp_geisha        = node_0.006      standing geisha doll
  jp_moongate      = node_0.007      circular curio / moongate shelf
  jp_stone_lantern = node_0.008      yukimi-doro stone lantern
  jp_mat_a/b       = Cube / Cube.001 woven rectangular mats
  jp_slat_mat      = Cube.002        wood slat platform
  jp_wood_bench    = Cube.003        twin dark wood low benches
  jp_table_geo     = Cube.009        dark geometric coffee/media table
  jp_art_roofs     = Cube.010        framed roof art
  jp_art_street    = Cube.011        framed pagoda street print
  jp_shelf_ledge   = Cube.012        dark wood picture ledge (015 dupe)
  jp_knit_pillow   = Cube.013        knit throw pillow (014/016/017 dupe)
  jp_rug_round     = Cylinder        round sisal/jute rug
  jp_paper_lantern = Sphere          washi paper lantern shade (Sphere.001 similar)
  jp_art_py/wind   = Plane.005–008   framed posters (4)

Skipped architecture: Plane/Plane.001/002/003/004/009/010, Cube.004–008 walls/beams,
Cylinder.001/002 poles, Sphere.002 sky, Point lights. Cars N/A in this pack.

Re-extract: `NODE_PATH=/tmp/loft-tools/node_modules node scripts/extract-novopo-furniture.mjs`
(source NOVOPO_SRC default /workspace/uploads/novopo-interiors/loft_japanese_11_free_interior.glb).

── Shared
Albedo: default ≤512 JPEG q90; hero atlases 1024 PNG. Each piece floored (minY=0),
XZ-centered, Y-up (FBX Z-up parents corrected with Rx(-90) at extract). Placement is yaw-only.

Sandbox loads both kits (?v=… cache-bust). Grass catalog grid (CATALOG_NAMES =
LOFT_CATALOG_NAMES + NOVOPO_CATALOG_NAMES) east of apt shell near Large_3.
Mass InstancedMesh bake in roomTemplate.js still uses loft living-room subset only.
