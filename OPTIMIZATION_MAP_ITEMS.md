# Map-item optimization (what is in the scene)

Audience: another coding agent. This file is the **what** of city geometry: how streets, props, bank, and buildings become GPU objects.

Companion: `OPTIMIZATION_LOADING.md` (rings, FPS governor, yield, when shadows turn on).

If a hitch is **a specific asset**, **draw-call count**, **merge of a prefab**, **InstancedMesh strategy for a type**, or **castShadow on every curb**, change code described here and update this doc.

If a hitch is **when** that work runs or **how large a time slice** is, use the loading doc.

---

## Goal

One draw (or a few material batches) per repeated kit piece, not one Mesh per window. Share GPU buffers via GLTF cache + `InstancedMesh`. Heavy prefabs are merged **once** then instanced across the grid.

Downtown Source glTFs: `public/models/downtown/Exports/glTF/`. Asset inventory: `SOURCE_SWAP.md`.

---

## GLTF cache

`src/world/AssetLoader.js`:

- Key: `url|vc:0|1`. One parse per key.
- First consumer gets the prepared root; later consumers `clone(true)` (shared geometry/materials).
- **Do not** enable `THREE.Cache`. `GLTFLoader` + ImageBitmap: cached bitmap detaches after first GPU upload (hang / black textures).
- Default: strip `COLOR_0`. Source downtown / nature: `{ keepVertexColors: true }`.
- Default: neither `castShadow` nor `receiveShadow`. Jobs pass `groundOpts()` / `castOpts()` / `noCastOpts()` (`src/world/shadowPolicy.js`). Only the Porsche still receives on the body.

Log: `gltf:parse {file}`, `clone` if measured.

---

## Instancing

`src/world/instancing.js`.

`InstancedMesh` per **mesh node** in the template (multi-material files → multiple instancers). Capacity is `loadGovernor.instanceBatch` at allocation time (4–32). Growing instancers **freeze** `step` when the grower is created so indices stay consistent.

| API | Use |
|---|---|
| `addInstancedGltf` | Sync slices (avoid for large pose lists) |
| `addInstancedGltfAsync` | Yield after each batch (bank) |
| `createGrowingInstancedGltf` | Sort poses by Chebyshev to car; `reveal(radius, maxAdd)` allocates the next batch only when needed |

Never allocate one mesh with capacity = all asphalt tiles (was `x336` hitch).

Log: `instancer {meshName} x{capacity}`.

---

## Streets and sidewalks

`src/world/CityGrid.js` → `collectJobs()` → `stream.addUrl(..., priority 0)`.

Repeated tiles (asphalt, sidewalks, stripes) are pose lists + one glTF. Unique curves (`Street_Curve_4Lane_Long_Curb.gltf`, `Street_Curve_4LaneShort.gltf`) still **parse once** but first GPU upload of that geometry is expensive — unique heavy streets are map-item candidates (simpler mesh, or merge at authoring time).

Ground jobs (`groundOpts()`, including `Street_TIntersection`) use **MeshLambertMaterial** keyed by albedo hex only (no maps, no Standard), same as the bank. The loader **strips images/textures from the glTF JSON** before parse so ImageBitmap of asphalt/normal/ORM maps we would discard cannot occupy `stream ring 10 prio 0` (~3s +13prog).

---

## Street furniture

`src/world/StreetFurniture.js` — priority 1 URL jobs + one in-memory streetlight template.

Same instancing path. Shop awnings share `Prop_Awning.gltf` / `Prop_Awning_Long.gltf` (not one unique branded glTF each). Signs/ornaments do **not** cast shadows. Stairs, rails, fire escapes, planters, bollards, arches do.

Stairs use **one** rail glTF per material (`Stairs_Rails_Concrete` / `Stairs_Rails_Marble`), instanced on the stair poses. Do **not** also stream `*_Straight_1/2` and metal variants on the same stairs: that was nine unique parses in one priority-1 ring (Windows hitch list: five `gltf:parse Stairs_Rails_Ma*` rows, 550–1662 ms). The bins are tiny; the cost is first GPU program per file.

Planter rows use **one** glTF per size (`Prop_Planter_Center` / `Prop_Planter_Small_Center`), instanced along the row. Do **not** also stream `*_Side_L` / `*_Side_R`: six unique parses for ~10 pots (Windows hitch list: `gltf:parse Prop_Planter_Sm*` 1156 ms).

---

## Bank

`src/world/BankBuilding.js` — stream **task** priority 2, AABB (9–25, 9–33).

- Collect pose lists per kit piece (windows ×129, walls, cornice, door, …).
- Sequential `loadGltf` + `addInstancedGltfAsync` (yield per GPU batch).
- Stream-time bank shaders are **MeshLambertMaterial** keyed by albedo hex (no maps, no Standard). `MI_FakeInterior` + Standard on Trim_FirstFloor_Window compiled two programs in one 4–5s hitch (`stream ring 10 prio 2 +2prog`) even after skipping interiors. Grid buildings still use Source Standard + interiors.
- Physics: **one** static box for the whole bank, not per window.

Do **not** clone+merge hundreds of bank nodes (old ~100ms hitch + seconds of wall time).

Do **not** wrap all 129 windows in one sync `measureLoadSync('bank:inst window x129')`.

Log: `bank:total BankBuilding`, per-batch `instancer`.

---

## Grid buildings (7 types)

Specs: `src/world/buildings/specs.js`.  
Load/orient/merge: `src/world/buildings/catalog.js`.  
Bake: `src/world/buildings/merge.js`.  
Place: `src/world/CityBuildings.js` → `WorldStream.addBuilding`.

Pipeline per type (lazy, once):

1. `loadGltf` Source prefab, vertex colors on.
2. `prepareInteriors`.
3. If name starts with `Large`: `waitUntilSmooth(42)` (**loading** gate).
4. `prepareSourceBuilding` — rotate facade to −Z, sit on ground, store `userData.collider`.
5. `mergeBuilding` — bake by material into few meshes; `mergeStride` yields (**loading** knob, **merge algorithm** is map-item).
6. `createGrowingInstancedGltf` like streets — GPU batches of `instanceBatch`, not one `InstancedMesh` with capacity = all copies. First instance of a type is revealed alone, then a yield (Large also `waitUntilSmooth`) so the first GPU upload of the merged prefab is not stacked with more copies. Log: `instancer Large_2 x{batch}`.

Roof number sprites (1–7) are debug markers, not the wash-out bug.

Merge must unify optional attrs (`color`, `uv1`, `uv2`) or `BufferGeometryUtils.mergeGeometries` fails (console errors on mixed typed arrays).

---

## Lighting / shadows (per object)

Policy: `src/world/shadowPolicy.js`.

- **Receive (PCF sample):** asphalt, sidewalks, intersections, unique street tiles. Painted lines/decals do not sample.
- **Cast, no receive:** merged buildings, trees, stairs/rails, fire escapes, planters, bollards, arches, streetlights, Porsche, bank massing.
- **Neither:** signs, awnings, ornaments, bank windows, most furniture.

PCF on every receiver was the play hitch (~1s CPU, 0 new programs, 600–900 draws). Turning **receive** off on buildings/props does not drop draw-call count; it drops fragment cost. Turning the **pass** off until stream ends is loading (`OPTIMIZATION_LOADING.md`).

---

## Physics

Bank: one AABB. Buildings: per revealed instance box. Not a draw-call issue; too many bodies would be a map-item (combine colliders).

---

## Log → which item to change

| Tag / pattern | Likely item | Direction |
|---|---|---|
| `gltf:parse Street_Curve_*` 100–250ms | Unique heavy street mesh | Simplify glTF or accept; loading only spreads it |
| `instancer Street_Asphalt_* x{large}` | Batch too big **or** too many tiles in one mesh | Smaller batches = governor; fewer tiles / shared geom = this file |
| `instancer Sidewalk_Straight_3m_Stripe x24` | Stripe mesh first GPU fill | Cheaper stripe mesh; or don’t cast shadows |
| `bank:inst window x129` (legacy) | Windows in one sync loop | Keep async batches |
| `merge Building_Large_*` 30–70ms then hitch | Merge CPU vs next-frame GPU | Merge code here; `waitUntilSmooth` in loading |
| `after: instancer Large_*` / `Medium_*` | First GPU of merged prefab | Grow batches; first instance + yield before more copies |
| `draw frame+shadows` / play hitch 1s, 0 +prog | Too many **receivers** sampling PCF | Keep receive on ground only; fewer unique InstancedMeshes if calls stay ~900 |

---

## Files owned by this document

- `src/world/shadowPolicy.js`
- `src/world/AssetLoader.js`
- `src/world/instancing.js` (mesh construction; batch **size** table lives in governor but **using** InstancedMesh is here)
- `src/world/CityGrid.js`, `StreetFurniture.js`, `BankBuilding.js`, `CityBuildings.js`
- `src/world/buildings/catalog.js`, `merge.js`, `specs.js`, `interiors.js`
- `src/world/Intersection.js` (boot intersection meshes)
- Lighting object flags in `main.js` / `AssetLoader.prepareModel`
- `SOURCE_SWAP.md` for which glTF is canonical

---

## Decision rule

Edit **this** doc + those files when the question is: *this type should instance / merge / not cast shadows / share a glTF / use one collider.*

Edit **OPTIMIZATION_LOADING.md** when the question is: *same items, but do less per frame, later rings, or delay GPU features.*
