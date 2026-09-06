# 05 — Apartments (glass + on-demand interiors)

## Contract

- Downtown MegaKit windows are **real transparent glass** (not FakeInterior emissive textures).
- **Um template; todas as janelas são slots; budget de interiores vivos é HUD-driven.**
- One reusable **apartment room template**; every window slot *can* use that same template (cloned).
- Interiors are **on-demand only**. Buildings do not preload all apartments.
- Budget: **`liveTarget`** (number or `'all'`, default **3**) — how many **full interiors** stay live on the active facade. Excess slots keep a **closed curtain** and **no room** (`curtain-only`) to free memory. `'all'` = every window slot on that facade.

## Glass + kit shell

- `applyWindowGlass` replaces `MI_FakeInterior*` / `MI_Glass` with shared transparent glass (opacity ~**0.09**, Physical, no env-map requirement). Slightly clearer than early phase-1 (0.14) so lit rooms read through outdoor glare.
- `stripKitInteriorShell` removes meshes whose materials are `MI_InteriorWall` / `MI_InteriorFloor` **before** `mergeBuilding`, so clear glass shows our room — not the dark MegaKit shell.
- On merge, transparent materials get `castShadow: false`.

## Slots

- Extracted **before** `mergeBuilding` from `MI_FakeInterior*` triangle centroids, clustered into window-sized slots.
- Stored on the merged template as `userData.apartmentSlots` (local space of the prepared template).
- Curtains + room are **scene overlays** (not InstancedMesh). Curtains sit **outside** glass (local −Z). **No opaque reveal plane** — glass stays transparent; the 3D room is visible through it. Auto-load applies `liveTarget` on mark.
- **Interior quality (phased):** phase 1 = clear glass + `Brick_InteriorWall` + Standard procedural furniture. Later phases add kit props / unique layouts. Same exterior MegaKit bar, built pouco a pouco.
- **Phase-1 visibility bar:** from the street you must instantly see “tem quarto” — bright/emissive walls + fill lights strong enough under ACES outdoor exposure, and a **large near-glass silhouette** (sofa / plant) pushed toward the −Z opening. Furniture buried deep in the room is not enough.

## Command API (`ApartmentDirector`)

Exposed as `window.__cityApartments` (`liveTarget` default 3).

| Call | Effect |
|------|--------|
| `registerFacade(id, { slots, pose, parent })` | Remember a revealed building placement |
| `setLiveCount(facadeId, count)` | `count` = number or `'all'`; rank mid-height street-facing slots; ensure first N full (curtain + room, open); strip others to `curtain-only` |
| `getLiveTarget()` | Current budget (`number` \| `'all'`) |
| `loadedCount()` | Full interiors only (room present) |
| `curtainOnlyCount()` | Units that kept a closed curtain after a budget cut |
| `load(facadeId, slotIds)` | Load one or more apartments on that facade |
| `loadCount(facadeId, n)` | Load `n` best idle slots (mid-height street-facing, largest first) |
| `unload(facadeId?, slotIds?)` | Remove interiors + curtains |
| `update(dt)` | Animate curtain open (scale only; shared mat) |
| `pickFacadeNear(x, z)` | Nearest registered facade to planar point |

## HUD (`#apts-budget`)

- Compact panel: label **Interiores**, `−` / number input / `+`, button **Todos**.
- Applies to nearest facade (free-fly camera if active, else car) → `markFacadeHouse({ autoLoad: false })` → `setLiveCount` (HUD owns the budget; mark must not race an auto `setLiveCount(3)` after Todos).
- Immediate apply on `+/−/Todos` and on Enter / change in the input. Busy class while applying.
- While applying, the number input and banner track **live/total** (for `'all'`, input rises with loaded count — must not stay stuck at the previous budget).
- Hidden in `boot-idle` like other floats.

## Curtain states (per apartment)

`idle` → `loading` (curtain **closed**) → `ready` (interior in scene, optional `compileAsync`, **curtain snap-hidden**) → `open`.

Budget cut: `open`/`ready` → **`curtain-only`** (room disposed carefully; shared template kept; curtain reset closed + visible). Raising the budget again reloads the room and re-opens.

Curtain hides **as soon as** the interior is added and warmed (snap hide — no closed plane left over the glass). No FPS adapt.

**Shared curtain:** one `MeshStandardMaterial` + one unit `PlaneGeometry`, scaled per slot. Compile warms **once**; do not create per-unit curtain materials (that caused ~11s `apartment-curtain` hitch spam × N). Never mutate shared `material.opacity` — open/close via `scale` + `visible` only. Do not dispose shared curtain geo/mat on unit teardown.

**Draw during budget apply:** apartment `compileSubtree` uses `pause: false` so a long Todos batch does **not** hold `pauseDraw` / freeze the canvas. The game loop keeps presenting; curtains hide and rooms show through glass as each unit becomes `ready`. Shared room **and curtain** materials skip re-compile after the first warm. Stream/world compiles still pause as before. No FPS HOLD / adaptive pause for apartments.

## Orientation

- Room opening faces local **−Z**; `slotLocalMatrix` builds +Z = inward (−outward normal). Curtain at local −Z (outside glass). If a facade’s slots face the wrong way, rooms sit inside the mass — fix normals once at slot extract / matrix, don’t special-case per building.

## Out of scope

- Per-frame quality adapt / HOLD for apartments.
- Unique furniture per unit (one shared template is enough).

## Marker

- First **Large** facade auto-gets a giant house billboard (~80 m) + yellow beacon at **Y=160** + cyan pole, plus a yellow HTML banner `CASA APTS · N/total vivos`, and **auto-applies `liveTarget`** on mark (`autoLoad` default true). The Interiores HUD moves the marker with `autoLoad: false` then applies the requested budget itself.
