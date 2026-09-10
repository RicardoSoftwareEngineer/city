Loft + novopo furniture/decor + cars/architecture catalogs (Sketchfab free interiors).

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

── novopo_furniture.glb (multi-pack furniture/decor)
Sources under /workspace/uploads/novopo-interiors/. World-bake extract
(floored Y-up, lean ≤512 JPEG / hero 1024 PNG). Runtime MeshBasic.

Pack piece counts (catalog prefixes):
  jp11   20  loft_japanese_11_free_interior   (jp_*)
  l6     12  loft_interior_6_for_free         (l6_*)
  l2      9  loft2_free_interior              (l2_*)
  l13    16  loft_13_living_room_interior     (l13_*)
  bed     9  interior_8_bedroom               (bed_*)
  mini    8  interior_15_mini_loft            (mini_*)
  i9      4  interior_9_free_with_cars        (i9_*) — cars live in extras
  shelf   7  loft_style_shelfs                (shelf_*)
  chair2  6  loft_style_chairs                (chair2_*) — Beweld kept
  clock   1  vintage_stand_clock              (clock_stand)
  TOTAL  92

Skipped here: room shells, lights, HDRI spheres, and cars (see extras).

Re-extract furniture:
  NODE_PATH=/tmp/loft-tools/node_modules node scripts/extract-novopo-packs.mjs

── novopo_extras.glb (cars + architecture)
Lean separate kit so furniture VRAM stays stable (RX 580 8GB). Arch ≤256 JPEG;
cars ≤1024 PNG. Same floored Y-up / MeshBasic catalog UX.

  cars    2  interior_9 node_0 / node_0.001   (car_a, car_b)
  arch   30  wall/floor/window/beam/door panels from i9,l6,l2,l13,bed,mini,jp11
  TOTAL  32

Skipped: HDRI spheres, Point/Sun/Spot lights, furniture already in novopo_furniture,
duplicate siblings (pipes, panes, windows, cushions).

Re-extract extras:
  NODE_PATH=/tmp/loft-tools/node_modules node scripts/extract-novopo-extras.mjs

── Shared
Albedo: furniture default ≤512 JPEG q90 / hero 1024 PNG; extras arch ≤256 / cars 1024.
Each piece floored (minY=0), XZ-centered, Y-up (world-bake). Placement is yaw-only.

Sandbox loads loft + novopo furniture + novopo extras (?v=… cache-bust). Grass catalog
zones east of apt shell near Large_3: furniture (10-col) | cars (2-col wide) |
architecture (8-col). Mass InstancedMesh bake in roomTemplate.js still uses loft
living-room subset only.
