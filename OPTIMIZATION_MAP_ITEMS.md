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

1. `loadGltf` Source prefab, vertex colors on, **Lambert hex-only** (same as bank/ground). `gpu compile inst Small_2` was ~2.3s Standard+maps on the merged instancer.
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

## Open countryside terrain (Passo 1–15)

`src/world/terrain/TerrainWorld.js` + `heightField.js` + `paths.js` — stream **tasks** priority 4.

- 40×40 m `PlaneGeometry` tiles (~20 segs / 2 m) covering the outer ring up to `GROUND_BODY_HALF` (±300).
- Hole over the city: skip tiles whose **center** is inside `isInsideCity`; edge tiles still displace via `surfaceY` (Y=0 inside the AABB minus path groove outside).
- Shared Lambert + vertexColors via `splatMaterial.js`: grass `0x4a7c3f` / dirt `0x8b7355` / rock `0x6b6560` when `slopeAt > 0.65`. Path bed stays dirt. `receiveShadow = false`.
- **Height:** `heightField.js` amplitude 4–12 m, blend 20–30 m (parameterized). City hole stays 0. Mesh + HF use `surfaceY`.
- **Path bed:** `paths.js` seed-fixed south/west/north/east exits (~110–130 m) + one short SW cross-link, `PATH_HALF_WIDTH = 2` (~4 m). `surfaceY = heightAt - pathDepression` used by mesh **and** Heightfield so the car follows the groove. Regenerating paths stays seed-fixed (`TERRAIN_SEED+17`).
- One task per tile; `dist` = Chebyshev from stream origin to tile center.
- **Passo 2 physics:** same task builds a Cannon `Heightfield` on the same `(TILE_SEGS+1)²` grid (`elementSize = 2`). Quaternion `-PI/2` on X; body at `(x0, 0, z0+TILE)` with flipped j so world Y = `surfaceY`. No single giant HF.
- City flat ground box shrunk to `cityBounds()` + ~3 m pad (top still `ASPHALT_SURFACE_Y`). Soft outer fence at ±300. City perimeter walls stay off.

### Vegetation (Passo 4–7, 10–15)

`scatter.js` + `Vegetation.js` + `windMaterial.js` + `treeLod.js` + `kitUrls.js` — urlJobs prio **4**, denser MegaKit grass prio **5**.

- Prefer MegaKit shortlist (`/models/stylized-nature/Exports/glTF/`); Nature Pack fallbacks via `kitUrl(role)`.
- Deterministic grid/jitter/groves from `TERRAIN_SEED`. Reject city, path bed, steep slope for tall grass. Clover/flowers denser on path shoulder (Passo 13).
- Growing instancers only. Never one InstancedMesh with capacity = whole field.
- `uGust` slow second sine in `windMaterial` (Passo 12). Wind on grass/flower/bush only.
- Trees: `THREE.LOD` (TallThick/Birch/Cherry near; GiantPine/Common far), streamed in chunks — not instanced. Mini-groves at path ends (Passo 14).
- Horizon: sparse GiantPine silhouettes, no cast (Passo 15). Rocks on `slopeAt > 0.65`.
- Terrain vertex splat: grass / dirt path / rock (`splatMaterial.js`), one Lambert program.

Log: `path network`; `terrain mesh/phys`; `veg …`; `veg treeLod …`.
- Fog: **off** (`scene.fog = null`); sky/background stays `0xdbeafe`.

---

## Physics

Bank: one AABB. Buildings: per revealed instance box. Terrain: one Heightfield body per 40 m tile (Passo 2), created with the visual. City streets: one flat box over `cityBounds`+pad only. Not a draw-call issue; too many bodies would be a map-item (combine colliders).

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
| `gpu compile mesh Object_50` ~5s | Porsche emblem (4 verts) with TEXCOORD_0..4 + tangent + Standard | Strip `uv1`–`uv4` on load in `PorscheModel` |
| `gpu compile mesh Object_50` ~3.4s after UV strip | Emblem still Standard + normalMap + receiveShadow | `MeshBasicMaterial` + no tangent/color/shadows on `Object_50` |
| `gpu compile mesh Object_50` ~3s after MeshBasic | `compileAsync` of the 4-vert logo still ~3s on this VM | Remove emblem (`Object_50` / `Object_44` / material `*emblem*`) from the graph |
| `gpu compile inst Small_2` ~2.3s | Merged building InstancedMesh still Standard + maps | `useLambert: true` on building `loadGltf` (hex Lambert, strip textures) |
| `gpu compile mesh Object_49` ~3.3s | 18-vert badge, 4 UV sets, Standard+map (4 copies: 45/49/53/57) | Drop Porsche meshes with ≤24 verts from the graph |
| `gpu compile mesh Object_48` ~3.6s | 1955 verts, Standard+normal+tangent, mat `roughness_fine_001_DIFF` | Remaining Porsche meshes: shared `MeshLambertMaterial` (map+hex), no receiveShadow |

---

## Files owned by this document

- `src/world/shadowPolicy.js`
- `src/world/AssetLoader.js`
- `src/world/instancing.js` (mesh construction; batch **size** table lives in governor but **using** InstancedMesh is here)
- `src/world/CityGrid.js`, `StreetFurniture.js`, `BankBuilding.js`, `CityBuildings.js`
- `src/world/buildings/catalog.js`, `merge.js`, `specs.js`, `interiors.js`
- `src/world/Intersection.js` (boot intersection meshes)
- `src/world/terrain/*` (tiles, paths, scatter, wind, vegetation)
- `src/vehicle/PorscheModel.js` (mesh attrs / shadow flags on the car)
- Lighting object flags in `main.js` / `AssetLoader.prepareModel`
- `SOURCE_SWAP.md` for which glTF is canonical

---

## Decision rule

Edit **this** doc + those files when the question is: *this type should instance / merge / not cast shadows / share a glTF / use one collider.*

Edit **OPTIMIZATION_LOADING.md** when the question is: *same items, but do less per frame, later rings, or delay GPU features.*


### Tree LOD

- Tree `THREE.LOD`: **world pose on the LOD**, levels at local origin. Distance/culling use the LOD position — never leave LOD at (0,0,0) with children offset (countryside trees vanished past ~140 m from origin).

