# Loading optimization (scheduler / pacing)

Audience: another coding agent. This file is the **when and how much** of world construction, not the **what** of each mesh.

Companion: `OPTIMIZATION_MAP_ITEMS.md` (geometry, instancing, materials, shadows per object).

If a hitch is **time-sliced wrong**, **FPS-adaptive knobs**, **yield/budget**, **stream order**, or **when GPU features turn on**, change code described here and update this doc.

If a hitch is **one mesh type too heavy**, **too many draw calls**, **merge cost of a prefab**, or **shadow casters on asphalt**, use the map-items doc.

---

## Goal

Keep the game loop near **45 FPS** (`TARGET_FPS`) while the city still streams in. Porsche + `GameLoop` start immediately. World construction is cooperative: small slices of work, then `requestAnimationFrame` / `scheduler.yield`.

Never block the main thread with: one giant `InstancedMesh` allocation, one `renderer.compile(scene)`, or one merge of a Large building without `waitUntilSmooth`.

---

## Boot sequence

Entry: `src/main.js`.

1. `Renderer` — `shadowMap.enabled = false` (shadows are a post-stream GPU feature).
2. Intersection (local, small).
3. `createCityStream(cityGroup, physics, originX, originZ)` — origin is saved car pose or `(0, 4)`.
4. Load Porsche, start `GameLoop`.
5. Background: `stream.pumpTo(STREAM_STEP, 0)` then `stream.continueAfter(STREAM_STEP)`.
6. `waitUntilSmooth(40)` then `renderer.resumeShadows()` (enable map, **no** full-scene `compile()`).
7. `dumpLoadLog()`.

`STREAM_STEP = 10` meters Chebyshev (`src/world/WorldStream.js`).

---

## Stream model

`WorldStream` holds:

| Collection | Typical content | Priority |
|---|---|---|
| `urlJobs` | streets, sidewalks, furniture glTF + pose lists | 0 streets/sidewalks, 1 furniture + trees + planters |
| `templateJobs` | already-built template (streetlights) | 1 |
| `tasks` | bank build, origin decals, countryside terrain tiles | 2 (bank), 4 (terrain) |
| `buildings` | 7 types × many placements | 3 |

`pumpTo(radius, maxPriority)`:

- For each priority `0..maxPriority` (filtered by `maxPriority` on first pump; hard list `[0,1,2,3,4]`).
- Load glTFs whose **nearest pose** is inside the radius (`minPoseDist`).
- `createGrowingInstancedGltf` then `reveal(radius, loadGovernor.chunk)` in budget ticks.
- Run tasks with `dist <= radius`.
- `revealBuildings` only at priority 3.
- Priority **4**: open-countryside terrain tile tasks (`registerTerrain`) — after buildings; each task also builds that tile’s Heightfield (`phys {ix},{iz}`). First boot pump may stay `maxPriority 0`.

`continueAfter(r)`: `pumpTo(r, 4)` then rings `r+10, r+20, …` until `maxRadius()`.

Tag: `beginLoad('stream', 'ring {radius} prio {priority}')`.

Register wiring: `src/world/registerCity.js`.

---

## Governor (the throttle)

`src/engine/LoadGovernor.js`. `GameLoop.animate` calls `noteFrame(rawDelta)` **before** clamping physics delta.

State:

- `fps` — EMA of instantaneous FPS.
- `instantFps` — last frame (HUD).
- `level` — `0..4` (HUD `loadPercent = level/4*100`).
- Hitch (`rawDelta > 1/24` s): `level -= 1.2`, `noteHitch`.
- Else: `level += (fps - 45) * (streaming ? 0.015 : 0.045)`.
- **`streaming` (set in `main.js` for the whole `pumpTo`/`continueAfter`)**: `level` capped at 2; `instanceBatch`/`chunk` max **8**; `budgetMs` max **6**; `yieldEvery` = 1. EMA FPS between hitches used to restore batch 32 and dump 400 draws / 2 M tris in one `render()` (~1.6 s). HUD shows `· cap` while this is on. Cap lifts before shadow warmup.

Derived knobs (edit these tables when pacing is wrong, not when a glTF is wrong):

| Getter | Maps `level` to | Used by |
|---|---|---|
| `budgetMs` | 1.5 … 12 ms of stream work per tick | `createBudget().tick()` |
| `chunk` | 1 / 3 / 8 / 16 / 32 instances revealed | `grower.reveal(radius, chunk)` |
| `instanceBatch` | 4 / 8 / 16 / 24 / 32 GPU buffer capacity | `instancing.js` (also a map-item concern: **size** of alloc; **when** it changes is loading) |
| `mergeStride` | yield every 2 / 6 / 14 child meshes | `merge.js` |
| `yieldEvery` | yield every 1 / 2 / 3 work units when healthy | `yieldAfterWork` |
| `needsRest` | `fps < 30` or `level < 0.8` | `waitIfSlow` |

HUD (`index.html` `#perf-hud`): FPS, carga 0–100, `batch`, `chunk`, `budgetMs`.

---

## Yield helpers

`src/world/yield.js`:

- `yieldToMain` — **two** `requestAnimationFrame`s (a single rAF can run in the same turn as GameLoop + the next compile, packing 13 programs into one 3.7s hitch).
- `yieldAfterWork` — always yield if resting or `level < 2.4`; else every `yieldEvery` calls.
- `waitIfSlow` — up to 12 frames while `needsRest`.
- `waitUntilSmooth(minFps, maxFrames)` — before Large merge and before enabling shadows.
- `createBudget` — yield when elapsed work ≥ `budgetMs`.

---

## Shadows as a loading-phase feature

Not “how to shade a building” (that is map-items). Here: **when** the shadow pass exists.

- During stream: `shadowMap.enabled = false`. Game loop draws as usual.
- After stream + `waitUntilSmooth(40)`: `resumeShadows()` (async):
  1. Pause scene draws (clear only) so the loop cannot compile-via-draw.
  2. `shadowMap.enabled = true`, `autoUpdate = false`, `needsUpdate = false`.
  3. `renderer.compile(object, camera, scene)` once per **Mesh and InstancedMesh** (not per unique material — instancing is a different program). Yield on `budgetMs` / `waitIfSlow`. Log: `gpu compile inst|mesh {name}`.
  4. `needsUpdate = true`, unpause, one rAF — next draw is `frame+shadow-bake` (depth map only).
- Do **not** `compile(entire scene)` in one call. `compileAsync(scene)` still runs a full sync `compile()` first.

---

## Profiling (loading)

`src/engine/loadLog.js`:

- Hitch line: `MAP|LOAD`, `phase`, `work:` (last non-draw tag — instancer/parse, not overwritten by draw), `draw: Xms Ncalls ktri Pprog +Δprog`, `shd:off|on|bake`, `carga`, `batch`.
- `MAP` → `OPTIMIZATION_MAP_ITEMS.md`. `LOAD` → this file. `+Nprog` means new WebGL programs that frame (shader compile).
- HUD lists top hitches with MAP/LOAD badge. `dumpLoadLog()` groups stolen ms by MAP vs LOAD.
- `setLoadPhase`: `boot` → `stream rN pP` → `shadow-warmup` → `play`.

Do not wrap a whole 129-instance type in one `measureLoadSync`; per-batch `instancer` tags are the unit of scheduling.

---

## Known loading bottlenecks (from hitch logs)

Treat these as **scheduler** problems first:

| Log pattern | Meaning | Loading-side lever |
|---|---|---|
| `draw:1000ms+` · 300–400 calls · **0 +prog** · carga 100 batch 32 | Stream sprinting; scene too fat for one frame | `streaming` cap batch/chunk 8 |
| `[hitch] after: gltf:parse X` | Parse then GPU | `waitIfSlow` before next URL; do not parse many unique streets in one ring without yield |
| `LOAD stream ring 10 prio 2` +Nprog | Bank task parsed 21 unique kit glTFs in one slice | `waitUntilSmooth` before bank; `waitIfSlow` + `yieldAfterWork` between each bank URL (same as street `urlJobs`) |
| `LOAD stream ring 10 prio 2` +8prog still ~3.7s after yields | `parentGroup.add(bankGroup)` dumped every new program into one `render()` | Pause draw, `compile` each new Mesh/InstancedMesh (`compileSubtree`), then unpause |
| `LOAD stream ring 10 prio 0` +13prog ~2.5s | First street `reveal()` dumped 13 programs into one `render()` | Same pause + `compileSubtree` after each ring's grower reveal (WorldStream) |
| `LOAD stream ring 10 prio 2` +8prog 6880ms after sliced compile | `scheduler.yield` did not wait for rAF; 8 compiles in one frame | `yieldToMain` is rAF-only |
| `LOAD stream ring 10 prio 2` +2prog ~4s and prio 0 +13prog ~2s after Lambert | compile of every new mesh ran after the whole ring reveal / whole bank add | `compileSubtree` after **each** url job reveal and **each** bank glTF |
| `MAP bank:total +9prog` / `gltf:parse Street_TIntersection +13prog` ~4s | `compile(mesh, camera)` without lights; first `render()` compiled the real programs | `compile(mesh, camera, scene)` — mesh is the graph, scene is lights only. Never `compile(scene)` as the first arg |
| `LOAD stream ring 10 prio 0` +13prog ~4s after lights compile | `compile()` returns before the driver finishes; first `render()` waited on 13 programs | `compileAsync` per mesh (still not `compileAsync(scene)`); wait until `isReady` then yield |
| `MAP bank:total BankBuilding` ~4s, 0 +prog after compileAsync | Pause-draw wrapped the whole bank; first `render()` uploaded every kit at once | After each kit: `resumeDraw` + `yieldToMain` + `pauseDraw` so first draw is one glTF |
| `gpu compile inst Cube017_3` 3–6s (Trim_FirstFloor_Window) | `compile(mesh, camera, scene)` `traverseVisible` of the whole city for two lights | `targetScene` is a probe with fog + cloned lights only |
| `LOAD stream ring 10 prio 0` +13prog ~4s after per-kit bank draw | Pause-draw wrapped the whole priority; first `render()` compiled 13 street/tree programs | After each url/template job: `resumeDraw` + `yieldToMain` + `pauseDraw` (same as bank kits) |
| `LOAD stream ring 10 prio 0` +13prog ~2.8s after per-job draw | 5 trees × bark/leaves + `Sidewalk_Planter` Standard compiled in prio 0 with the asphalt | Trees and planters are priority 1 (furniture), not 0 |
| `LOAD stream ring 10 prio 0` +13prog ~2.8s after skip textures | `compileSubtree(cityGroup)` recompiled the Porsche (not `_gpuCompiled`) with the first street instancers | Only compile meshes flagged `_streamInstancer` by `makeBatchMesh` |
| `LOAD stream ring 10 prio 0` +13prog ~3s after instancer-only compile | `beginLoad('gltf:parse')` ran in `finishGltf` *after* `GLTFLoader.parse`; hitch sat on the stream wrapper and reused a stale +13prog from the Porsche first draw | `beginLoad` before `load`/`parse` so Travamentos names the file |
| `MAP instancer Small_2 x4` +3prog ~3s | `revealBuildings` allocated the first merged-building InstancedMeshes with draw on; first `render()` compiled 3 programs | Pause draw, `compileSubtree` after that type's reveal, `resumeDraw` + yield (same as stream url jobs) |
| `LOAD stream ring 10 prio 0` +13prog ~3s after parse tagging | `pumpTo` `beginLoad` ran in the same turn as `GameLoop.start`; first `render()` compiled Porsche + corner markers (~13 programs) under the stream tag | `compileSubtree(scene, { instancersOnly: false })` after boot, before `pumpTo` |
| `[hitch] draw frame+shadow-bake` once after stream | One full shadow-map fill | Expected; must not repeat every frame (`autoUpdate` stays false) |
| `[hitch] draw frame+shadows` repeating after enable | Instanced programs not precompiled | `compile` every Mesh/InstancedMesh, not one host per material uuid |
| Tag expired / untagged | GPU after yield longer than old 80ms window | Keep 2.5s window; tag `stream` rings |

If the **same** glTF always hitch-parses (`Street_Curve_4Lane_*`), that file is also a **map-item** (simplify or pre-instance), but **spreading** its first draw is still this file.

---

## Files owned by this document

- `src/engine/LoadGovernor.js`
- `src/engine/GameLoop.js` (`noteFrame` on raw delta)
- `src/world/yield.js`
- `src/world/WorldStream.js`
- `src/world/registerCity.js` (priority / ring wiring only)
- `src/engine/loadLog.js`
- `src/engine/Renderer.js` (`shadowMap.enabled` timing, not material setup)
- `src/main.js` (boot order, HUD governor, `resumeShadows` timing)
- HUD: `index.html` `#perf-hud`, `src/style.css`

---

## Decision rule

Edit **this** doc + those files when the question is: *too much work this frame, wrong order, shadows too early, governor too aggressive, logs not attributing hitches.*

Edit **OPTIMIZATION_MAP_ITEMS.md** when the question is: *this object type should not exist in this form (merge, instance, drop shadows, fewer unique glTFs).*
