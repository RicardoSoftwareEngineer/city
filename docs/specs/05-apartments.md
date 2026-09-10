# 05 — Apartments (glass + on-demand interiors)

## Purpose

Vidro real, um room template InstancedMesh, `liveTarget`/Todos, cortinas e pacing de stream.

## Invariants / MUST / MUST NOT

- **MUST** janelas = vidro transparente real (não FakeInterior emissive).
- **MUST** um room template; slots via **InstancedMesh** (não Mesh clones); on-demand only.
- **MUST** `liveTarget` default `'all'` / **Todos** = `want = ranked.length` — stream upgrades shells to full open interiors (curtain snap-hide on ready).
- **MUST** every registered facade window slot **without** a ready/open interior show a **visible closed sheer curtain** (Fabric 203 shared InstancedMesh) outside the glass — including idle, waiting-in-pump, and heap-demoted slots. Never blank white/black holes.
- **MUST** stream pump (`throughValve` + yields) owns pacing — nunca for-loop sync no click.
- **MUST** `applyWindowGlass` (~0.09 **MeshBasic** shared) + `stripKitInteriorShell` antes de `mergeBuilding`.
- **MUST** slots pré-merge de `MI_FakeInterior*` → `userData.apartmentSlots`; opening faces local −Z.
- **MUST** cortinas fora do vidro (−Z); open/close via instance **scale** (0 = hidden) — nunca mutar opacity shared.
- **MUST** closed / curtain-only shells = shared InstancedMesh sheer (ShareTextures Fabric 203, CC0) **MeshBasic** with color+**alphaMap** only (no normal/rough — VRAM + light-loop) — translucency for light/silhouettes; one material for all instances.
- **MUST** shell intent live in `ApartmentDirector` (`_ensureFacadeShells` / `_stripToCurtainOnly`) — not scattered per-slot flags.
- **MUST** sem per-room `PointLight`; room + curtain + shared glass = **MeshBasic** (emissive folded into color / opacity glass) — never join Ultra-night street Spot/Point light loop; compile `pause: false`; warm room+curtain **uma vez**.
- **MUST** shared room bake include loft furniture shortlist (`/models/apartments/loft_furniture.glb`: sofa, plant, console, lamp, chair + box coffee/legs) as **MeshBasic albedo-only** (textures ≤512; sofa atlas 1024 PNG) merged into the same InstancedMesh material buckets — never unique furniture per unit; rescale to the 3.2×3.6×2.75 template so silhouettes read through the pane. GLB pieces MUST be floored + Y-up (extract Rx(-90) for Z-up FBX meshes); yaw-only coherent living layout. Do **not** import loft architecture (brick/beams/windows/cityscape) or loft Point light.
- **MUST** enquanto `isApartmentLiveIntentActive`: defer nature/water/carpet (prio ≥4).
- **MUST NOT** sync-slam N rooms no click; FPS HOLD; unique furniture por unit; dispose shared curtain geo/mat no teardown.
- Heap ≥0.6/≥0.72: demote farthest full interiors → **curtain-only** shells (keep sheer visible).

## Knobs

| Knob | Valor | Notas |
|------|-------|-------|
| `liveTarget` | `number` \| `'all'` (default) | HUD `#apts-budget` |
| Glass opacity | ~0.09 | Shared MeshBasic |
| Curtain | register/shell (closed) → loading (closed) → ready (snap-hide) → open; demote → closed shell | Scale only; Fabric 203 sheer MeshBasic (albedo+alphaMap only) |
| Room furniture | shared loft shortlist GLB | InstancedMesh + MeshBasic albedo; box fallback if GLB missing |
| Example sandbox | asphalt corner near `Large_3@171,30` + grass catalog zones | `window.__cityAptExample` — empty shell + furniture/cars/arch picker; staging only |
| Marker | First Large auto-mark | ~80 m billboard, beacon Y=160; `autoLoad` default true |

API (`window.__cityApartments`): `registerFacade`, `setLiveCount`, `getLiveTarget`, `loadedCount`, `curtainOnlyCount`, `load`/`loadCount`/`unload`, `update(dt)`, `pickFacadeNear`.

HUD Interiores: `−` / input / `+` / **Todos** → nearest facade → `markFacadeHouse({ autoLoad: false })` → `setLiveCount`. Hidden em `boot-idle`.


## Example sandbox (staging)

Freestanding **apt example room** on the asphalt corner SE of `Large_3@171.00,30.00` (`src/world/apartments/aptExampleSandbox.js`) — **empty shell** + labeled grass **catalog zones** (furniture | cars | architecture): loft-5 + novopo furniture (`novopo_furniture.glb`) + novopo extras (`novopo_extras.glb`, `car_*` / `arch_*`). **Drag** a catalog sample onto the room floor (or short-click / `addFromCatalog(name)`) to place; **drag** in-room pieces to slide on floor xz (`setPose` on release). While dragging, **mouse wheel** adjusts lift Y (scroll up / negative `deltaY` → raise; clamp 0–2.5 m); wheel is consumed so free-flight fly-speed / follow zoom do not change.

**Catalog arming:** near the staging AABB, wheel cycles the grass catalog **including a `(nenhum)` deselect slot** (HUD: `Catálogo [—/N]: (nenhum)`). Esc also jumps to nenhum. When nenhum is armed, LMB on ground does **not** place, the green select ring is cleared, and any catalog-attached gizmo is detached (room/world gizmo edits are left alone). The bottom staging HUD (`#apt-staging-hud-wrap`) shows a **live thumbnail** of the armed sample (one-shot offscreen `WebGLRenderTarget` → canvas beside the bar; placeholder `—` when nenhum). Sofa/chair/cars/arch stay authored Y-up + DoubleSide MeshBasic. `clearRoom` resets. Exposes `window.__cityAptExample` `{ root, pieces, catalog, addFromCatalog, setPose, getPose, clearRoom }`. **Staging tool only** — mass InstancedMesh template (`roomTemplate` bake) remains the product path (loft furniture shortlist only). Hard-refresh or `?v=` cache-bust on GLBs if cache sticks.

## Ownership

`ApartmentDirector` (intent/stamp/pump/HUD) · `streamIntent` (defer prio ≥4) · apartment prep (glass/strip/slots/bake) · `roomTemplate` (shared loft furniture bake) · `aptExampleSandbox` (staging room near Large_3).

## Same-PR rule

Glass, InstancedMesh, liveTarget/Todos, cortinas, marker, shared loft furniture bake ou apartment stream ownership → este arquivo.

## Out of scope

Quality adapt / HOLD. Unique layouts. Drive-defer streets-only → `02`. Loft architecture / per-room lights.
