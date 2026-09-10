# 05 — Apartments (glass + on-demand interiors)

## Purpose

Vidro real, um room template InstancedMesh, `liveTarget`/Todos, cortinas e pacing de stream.

## Invariants / MUST / MUST NOT

- **MUST** janelas = vidro transparente real (não FakeInterior emissive).
- **MUST** shared room bake via **InstancedMesh** pools (não Mesh clones); on-demand only.
- **MUST** **100 distinct layouts** (`layoutId = stableHash(facadeId, slotIndex) % 100`) stamped from **shared** furniture×wall InstancedMesh pools (20 furniture variants × 20 wall albedos) — unique *layouts* OK; still **MUST NOT** unique Mesh clones / per-room PointLight.
- **MUST** demote/reopen keep the same `layoutId` for that facade slot.
- **MUST** `liveTarget` default `'all'` / **Todos** = `want = ranked.length` — stream upgrades shells to full open interiors (curtain snap-hide on ready).
- **MUST** every registered facade window slot **without** a ready/open interior show a **visible closed sheer curtain** (Fabric 203 shared InstancedMesh) outside the glass — including idle, waiting-in-pump, and heap-demoted slots. Never blank white/black holes.
- **MUST** stream pump (`throughValve` + yields) owns pacing — nunca for-loop sync no click.
- **MUST** `applyWindowGlass` (~0.09 **MeshBasic** shared) + `stripKitInteriorShell` antes de `mergeBuilding`.
- **MUST** slots pré-merge de `MI_FakeInterior*` → `userData.apartmentSlots`; opening faces local −Z.
- **MUST** cortinas fora do vidro (−Z); open/close via instance **scale** (0 = hidden) — nunca mutar opacity shared.
- **MUST** closed / curtain-only shells = shared InstancedMesh sheer (ShareTextures Fabric 203, CC0) **MeshBasic** with color+**alphaMap** only (no normal/rough — VRAM + light-loop) — translucency for light/silhouettes; one material for all instances.
- **MUST** shell intent live in `ApartmentDirector` (`_ensureFacadeShells` / `_stripToCurtainOnly`) — not scattered per-slot flags.
- **MUST** sem per-room `PointLight`; room + curtain + shared glass = **MeshBasic** (emissive folded into color / opacity glass) — never join Ultra-night street Spot/Point light loop; compile `pause: false`; warm room+curtain **uma vez**.
- **MUST** shared furniture kit include loft + novopo + kit CC0 pieces (`loft_furniture.glb`, `novopo_furniture.glb`, `kit/furniture_kit.glb`: fridge/oven/sink/couches/TV/sofa/shelf/coffee/plants…) as **MeshBasic albedo-only** (textures ≤512; hero atlases ≤1024) merged into InstancedMesh material buckets per furniture variant — never unique furniture Mesh per unit; rescale to the 3.6×3.2×2.75 template. GLB pieces MUST be floored + Y-up; yaw-only. Do **not** import loft architecture or loft Point light.
- **MUST** plaster walls use shared **MeshBasic** + Poly Haven **CC0** albedos from `/textures/walls/…` (no normal/rough). Building path: 20 wall InstancedMesh pools (`WALL_POOL` in `aptLayouts.js`). Staging review arena may cycle the full ~58 showroom set.
- **MUST** enquanto `isApartmentLiveIntentActive`: defer nature/water/carpet (prio ≥4).
- **MUST NOT** sync-slam N rooms no click; FPS HOLD; unique Mesh clones / per-room PointLight; dispose shared curtain geo/mat no teardown.
- Unique **layouts** via shared instances are **OK** (100 recipes); unique Mesh clones are **NOT**.
- Heap ≥0.6/≥0.72: demote farthest full interiors → **curtain-only** shells (keep sheer visible).

## Knobs

| Knob | Valor | Notas |
|------|-------|-------|
| `liveTarget` | `number` \| `'all'` (default) | HUD `#apts-budget` |
| Glass opacity | ~0.09 | Shared MeshBasic |
| Curtain | register/shell (closed) → loading (closed) → ready (snap-hide) → open; demote → closed shell | Scale only; Fabric 203 sheer MeshBasic (albedo+alphaMap only) |
| Room furniture | loft + novopo + kit CC0 | 20 furniture InstancedMesh variants; MeshBasic albedo |
| Room walls | Poly Haven CC0 (20 pool / 58 staging) | Wall InstancedMesh pools; layout picks wallVariant |
| Layouts | 100 recipes (`aptLayouts.js`) | `layoutId = stableHash(facadeId, slotIndex) % 100` |
| Review arena | grass near wall showroom | `window.__cityAptLayouts` — visit() / visit(1..100); 4×25 inward ring |
| Example sandbox | asphalt corner near `Large_3@171,30` + grass catalog zones | `window.__cityAptExample` — empty shell + furniture/cars/arch picker; staging only |
| Marker | First Large auto-mark | ~80 m billboard, beacon Y=160; `autoLoad` default true |

API (`window.__cityApartments`): `registerFacade`, `setLiveCount`, `getLiveTarget`, `loadedCount`, `curtainOnlyCount`, `load`/`loadCount`/`unload`, `update(dt)`, `pickFacadeNear`.

HUD Interiores: `−` / input / `+` / **Todos** (inside **Cena / Ambiente** `hud-list-panel`, `#apts-budget`) → nearest facade → `markFacadeHouse({ autoLoad: false })` → `setLiveCount`. Hidden em `boot-idle`.


## Example sandbox (staging)

Freestanding **apt example room** on the asphalt corner SE of `Large_3@171.00,30.00` (`src/world/apartments/aptExampleSandbox.js`) — **empty shell** + labeled grass **catalog zones** (furniture | cars | architecture): loft-5 + novopo furniture (`novopo_furniture.glb`) + novopo extras (`novopo_extras.glb`, `car_*` / `arch_*`). **Drag** a catalog sample onto the room floor (or short-click / `addFromCatalog(name)`) to place; **drag** in-room pieces to slide on floor xz (`setPose` on release). While dragging, **mouse wheel** adjusts lift Y (scroll up / negative `deltaY` → raise; clamp 0–2.5 m). **Camera wheel never zooms** and never scales free-flight `flySpeed` — near staging, wheel only cycles the catalog (or height while furniture-dragging).

**Catalog arming:** near the staging AABB, wheel cycles **slot 0 = `(nenhum)` first**, then items `1…N` (HUD: `Catálogo [0/N]: (nenhum)` / `[1/N]…[N/N]`). Boot starts on nenhum (unarmed). Esc also jumps to nenhum. When nenhum is armed, LMB on ground does **not** place, the green select ring is cleared, and any catalog-attached gizmo is detached (room/world gizmo edits are left alone); mouse can look/pan freely. The bottom staging HUD (`#apt-staging-hud-wrap`) shows a **live thumbnail** of the armed sample (one-shot offscreen `WebGLRenderTarget` → canvas beside the bar; placeholder `—` when nenhum). Sofa/chair/cars/arch stay authored Y-up + DoubleSide MeshBasic. `clearRoom` resets. Exposes `window.__cityAptExample` `{ root, pieces, catalog, addFromCatalog, setPose, getPose, clearRoom }`. **Staging tool only** — mass InstancedMesh template (`roomTemplate` bake) remains the product path (loft furniture shortlist only). Hard-refresh or `?v=` cache-bust on GLBs if cache sticks.

## Show flat (hero interior)

Dedicated **Apartamento estudo** open loft on grass west of the opt-study showroom / SE of `Large_3@171,30` (`src/world/apartments/showFlatInterior.js`, origin ~`x=218,z=-14`). Composes optimized opt-study interiors as one coherent living space: **sala arco** (`loose_cef131` — living + kitchen + dining + bath + bed) + **quarto neon** suite (`loose_cece4d`) + **mobília / biblioteca** annex (`loose_fb2319`). MeshBasic + albedo maps (no PointLight). Soft evening via `__cityDayNight.setHours(18.35)` on **`visit()`** / `applyEveningLight()` only (not on spawn — boot keeps saved Hora). Exposes `window.__cityShowFlat` `{ root, origin, pieces, howToFind, cameraHint, suggestedHours, visit(), applyEveningLight() }`. Staging/screenshot showcase only — does **not** replace InstancedMesh `roomTemplate` bake.


## Official interior candidates (staging bake)

Five **official-size** shells (`3.6 × 2.75 × 3.2` m, open face **−Z**, same local convention as `roomTemplate` / InstancedMesh) on free grass **east of the show flat** / west-south of opt-study pads (`src/world/apartments/aptInteriorCandidates.js`, row origin ~`x=238,z=-10`, spacing 5.5 m). Each pad has a distinct furniture theme using loft / novopo pieces scaled to fit the building room — **not** oversized opt-study lofts. Each candidate also has a **unique Poly Haven CC0** plaster wall albedo (MeshBasic `map`, UV repeat ~1–2; floor/ceiling stay flat tint):

1. Living clássico (sofa + coffee + plant + console) — `painted_plaster_wall`
2. Compact TV / lounge — `patterned_plaster_wall`
3. Dining / mesa + cadeiras — `plastered_wall`
4. Study / desk + chair + plant — `white_plaster_02`
5. Minimal / sparse modern — `white_stucco`

Official `roomTemplate` bake default wall albedo: **`painted_plaster_wall`** (shared one material for InstancedMesh). Textures under `/public/textures/walls/<id>/<id>_diff_1k.jpg` + `LICENSE.txt` (CC0).

Show flat stays untouched (hero / screenshot loft). These candidates are the staging path toward an official bake into `roomTemplate`. Exposes `window.__cityAptCandidates` `{ root, rowOrigin, roomSize, candidates[], themes, wallTextures, howToFind, visit(i) }`. Lazy after playCore like the show flat.



## Wall paint showroom (staging)

Browseable **wall paint / texture showroom** of Poly Haven **CC0** 1k diffuse panels for picking official apartment paints (`src/world/apartments/wallPaintShowroom.js`). Grid of ~2.5×2.5 m vertical MeshBasic panels on free grass **south of the official interior candidates** (origin ~`x=238,z=-42`), grouped by category with Portuguese header sprites:

- **Tintas / Gesso** — plaster, paint, clay, light concrete
- **Madeira / Painéis** — planks, OSB, wallpaper, wood panels
- **Tijolo** — brick + plaster brick
- **Concreto** — modern concrete / facade
- **Outros** — bamboo, clay block, cladding, facade tiles

Reuses the five candidate wall albedos plus many more under `/public/textures/walls/<id>/<id>_diff_1k.jpg` (+ `LICENSE.txt`). Does **not** remove the five candidate walls or the show flat. Exposes `window.__cityWallShowroom` `{ howToFind, visit(), visit(id), inventory, count, categories }`. Lazy after playCore like candidates / show flat.

## Ownership

`ApartmentDirector` (intent/stamp/pump/HUD + layoutId) · `streamIntent` (defer prio ≥4) · apartment prep (glass/strip/slots/bake) · `roomTemplate` / `aptVariantBake` (furniture×wall InstancedMesh pools) · `aptLayouts` (100 recipes + hash) · `aptLayoutReviewStrip` (staging arena ring) · `aptExampleSandbox` · `showFlatInterior` · `aptInteriorCandidates` · `wallPaintShowroom`.

## Same-PR rule

Glass, InstancedMesh, liveTarget/Todos, cortinas, marker, shared loft furniture bake ou apartment stream ownership → este arquivo.

## 100 layouts (product)

Recipes in `src/world/apartments/aptLayouts.js` (seeded, reproducible). Each layout: theme, furniture piece poses (x,z,yaw), wall albedo id, `furnitureVariant` (0..19), `wallVariant` (0..19).

**Building curtains:** `ApartmentDirector` assigns `layoutId` on shell spawn; `_finishLoad` stamps furniture pool `[furnitureVariant]` + wall pool `[wallVariant]` with the same instance matrix. Demote → curtain-only hides room pools but keeps `layoutId`.

**Staging:** `aptLayoutReviewStrip.js` spawns all 100 official-size shells as an **inward-facing multi-floor arena** on grass west-south of the wall paint showroom (keeps showroom / candidates / show flat). Layout: **4 floors × 25/ring**, radius **24 m** (open-face plane), floor step **3.4 m**; each unit yaw so local −Z (open) points at arena center (~198,−55). Labels 001…100. API `window.__cityAptLayouts` `{ count:100, floors, perRing, radius, floorStep, visit(i|'center'), visitCenter(), howToFind, layout(i) }` — default `visit()` / `visit('center')` = mid-height center overview; `visit(1..100)` = exterior view looking into that unit.

**Kit:** `public/models/apartments/kit/furniture_kit.glb` (+ `LICENSE`) — Quaternius Ultimate House Interior (fridge/oven/…) + Poly Haven Sofa/TV/Shelf/CoffeeTable 1k. Aquarium: no solid CC0 found — skipped.

## Out of scope

Quality adapt / HOLD. Drive-defer streets-only → `02`. Loft architecture / per-room lights. Full 100 merged room geos (use variant pools instead).
