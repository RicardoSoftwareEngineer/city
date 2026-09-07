# 05 — Apartments (glass + on-demand interiors)

## Contract

- Downtown MegaKit windows are **real transparent glass** (not FakeInterior emissive textures).
- **Um template; todas as janelas são slots; budget de interiores vivos é HUD-driven.**
- One reusable **apartment room template**; every window slot *can* use that same template (cloned).
- Interiors are **on-demand only**. Buildings do not preload all apartments.
- Budget: **`liveTarget`** (number or `'all'`, default **`'all'`**) — HUD/ApartmentDirector **intent** for how many **full interiors** should stay live on the active facade. On mark/start (first Large auto-`markFacadeHouse` with `autoLoad`), intent `'all'` is applied via the stream pump — soft ceiling **`ALL_LIVE_SOFT` (16)** still applies; remaining slots stay curtain-only. The **stream pump** (LoadGovernor frame budget + `yieldToMain` / `throughValve`) owns pacing — never a click-time for-loop that builds every room on the main thread.
- **`'all'` soft ceiling (stream-owned):** full rooms cap at **`ALL_LIVE_SOFT` (16)**. Remaining slots on huge facades (e.g. Large_2 ≈77) get **curtain-only** shells (no room / no lights). Product “Todos” = as many full interiors as affordable, not 77× room clones in one apply.
- **MemoryGuardian demotion:** when heap pressure ≥0.6 / ≥0.72, the pump shrinks the live full-interior cap (same persona as streets/nature `wantsLoad` gates) and strips excess rooms to curtain-only mid-apply.

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

Exposed as `window.__cityApartments` (`liveTarget` default `'all'`).

| Call | Effect |
|------|--------|
| `registerFacade(id, { slots, pose, parent })` | Remember a revealed building placement |
| `setLiveCount(facadeId, count)` | Set **intent** (`number` \| `'all'`); stream pump ranks mid-height street-facing slots, loads full rooms up to stream cap (soft ceiling + heap demotion) with hard ms/frame budget + yields; `'all'` fills the rest as `curtain-only` |
| `getLiveTarget()` | Current budget (`number` \| `'all'`) |
| `loadedCount()` | Full interiors only (room present) |
| `curtainOnlyCount()` | Units that kept a closed curtain after a budget cut |
| `load(facadeId, slotIds)` | Load one or more apartments on that facade |
| `loadCount(facadeId, n)` | Load `n` best idle slots (mid-height street-facing, largest first) |
| `unload(facadeId?, slotIds?)` | Remove interiors + curtains |
| `update(dt)` | Animate curtain open (scale only; shared mat) |
| `pickFacadeNear(x, z)` | Nearest registered facade to planar point |

## HUD (`#apts-budget`)

- Compact panel: label **Interiores**, `−` / number input / `+`, button **Todos** (aria-pressed when `liveTarget === 'all'`; pressed on boot).
- Applies to nearest facade (free-fly camera if active, else car) → `markFacadeHouse({ autoLoad: false })` → `setLiveCount` (HUD owns the budget; mark must not race an auto apply after Todos).
- Immediate apply on `+/−/Todos` and on Enter / change in the input. Busy class while applying.
- While applying, the number input and banner track **live/total** (for `'all'`, input rises with loaded count — must not stay stuck at the previous budget).
- Hidden in `boot-idle` like other floats.

## Curtain states (per apartment)

`idle` → `loading` (curtain **closed**) → `ready` (interior in scene, optional `compileAsync`, **curtain snap-hidden**) → `open`.

Budget cut: `open`/`ready` → **`curtain-only`** (room disposed carefully; shared template kept; curtain reset closed + visible). Raising the budget again reloads the room and re-opens.

Curtain hides **as soon as** the interior is added and warmed (snap hide — no closed plane left over the glass). No FPS adapt.

**Shared curtain:** one `MeshStandardMaterial` + one unit `PlaneGeometry`, scaled per slot. Compile warms **once**; do not create per-unit curtain materials (that caused ~11s `apartment-curtain` hitch spam × N). Never mutate shared `material.opacity` — open/close via `scale` + `visible` only. Do not dispose shared curtain geo/mat on unit teardown.

**Draw during budget apply:** apartment `compileSubtree` uses `pause: false` so a long Todos batch does **not** hold `pauseDraw` / freeze the canvas. The game loop keeps presenting; curtains hide and rooms show through glass as each unit becomes `ready`. Shared room **and curtain** materials skip re-compile after the first warm. Stream/world compiles still pause as before. No FPS HOLD / adaptive pauseDraw for world streaming or apartments.

**Stream pacing (Todos / setLiveCount):** each full-room unit runs inside `throughValve` (LoadGovernor `budgetMs`) and is followed by `yieldToMain` (double-rAF, resets stream frame budget). Curtain-only shells for `'all'` overflow are also valve-admitted and **yield every spawn**. Per-room cost stays lean: **one** `PointLight` + emissive materials (not 3 lights × N slots). Hitch law: apartment-driven Travamentos frames >1000ms are bugs — the pump must keep presenting under load (including coincident nature stream).

**Stream ownership while intent pumps:** `_pumpLiveIntent` sets `streamIntent` (`isApartmentLiveIntentActive`). While active, WorldStream **defers** nature / water / carpet work at **prio ≥4** (ring `pumpTo` skip + `pumpNatureSlice` / `pumpCarpetSlice` early return) so their `pauseDraw` + multi-second `compileSubtree(parent)` cannot freeze the canvas mid-Todos. Resume when the intent finally-block releases. Shared curtain + room GPU programs are **warmed once** (`pause:false`) before Phase A. Not an FPS HOLD / adaptive valve.

## Orientation

- Room opening faces local **−Z**; `slotLocalMatrix` builds +Z = inward (−outward normal). Curtain at local −Z (outside glass). If a facade’s slots face the wrong way, rooms sit inside the mass — fix normals once at slot extract / matrix, don’t special-case per building.

## Out of scope

- Per-frame quality adapt / HOLD / FPS-driven pauseDraw for apartments.
- Unique furniture per unit (one shared template is enough).
- Loading every window as a full room on `'all'` for huge facades (soft ceiling + curtain-only overflow is intentional).

## Marker

- First **Large** facade auto-gets a giant house billboard (~80 m) + yellow beacon at **Y=160** + cyan pole, plus a yellow HTML banner `CASA APTS · N/total vivos`, and **auto-applies `liveTarget`** on mark (`autoLoad` default true). The Interiores HUD moves the marker with `autoLoad: false` then applies the requested budget itself.
