# 05 — Apartments (glass + on-demand interiors)

## Contract

- Downtown MegaKit windows are **real transparent glass** (not FakeInterior emissive textures).
- **Um template; todas as janelas são slots; budget de interiores vivos é HUD-driven.**
- One reusable **apartment room template**; every window slot *can* use that same template (**InstancedMesh** stamps, not Mesh clones).
- Interiors are **on-demand only**. Buildings do not preload all apartments.
- Budget: **`liveTarget`** (number or `'all'`, default **`'all'`**) — HUD/ApartmentDirector **intent** for how many **full interiors** should stay live on the active facade. On mark/start (first Large auto-`markFacadeHouse` with `autoLoad`), intent `'all'` is applied via the stream pump. The **stream pump** (LoadGovernor frame budget + `yieldToMain` / `throughValve`) owns pacing — never a click-time for-loop that builds every room on the main thread.
- **`'all'` / Todos = every window slot:** `want = ranked.length` — **every** slot gets a **full interior with curtain OPEN**. Closed curtain-only shells are **not** the product look for Todos (the old soft ceiling 16 + curtain overflow was wrong). Still stream-paced — never sync-slam ~77 rooms on click.
- **MemoryGuardian demotion:** when heap pressure ≥0.6 / ≥0.72, the pump may temporarily shrink the live full-interior cap (same persona as streets/nature `wantsLoad` gates) and **unloads farthest / lowest-ranked** rooms (full dispose) — prefer that over leaving closed curtains as the Todos facade.

## Glass + kit shell

- `applyWindowGlass` replaces `MI_FakeInterior*` / `MI_Glass` with shared transparent glass (opacity ~**0.09**, Physical, no env-map requirement). Slightly clearer than early phase-1 (0.14) so lit rooms read through outdoor glare.
- `stripKitInteriorShell` removes meshes whose materials are `MI_InteriorWall` / `MI_InteriorFloor` **before** `mergeBuilding`, so clear glass shows our room — not the dark MegaKit shell.
- On merge, transparent materials get `castShadow: false`.

## Slots

- Extracted **before** `mergeBuilding` from `MI_FakeInterior*` triangle centroids, clustered into window-sized slots.
- Stored on the merged template as `userData.apartmentSlots` (local space of the prepared template).
- Curtains + rooms are **InstancedMesh overlays** (not per-slot Mesh clones). Curtains sit **outside** glass (local −Z). **No opaque reveal plane** — glass stays transparent; the 3D room is visible through it. Auto-load applies `liveTarget` on mark.
- **Interior quality (phased):** phase 1 = clear glass + **baked room template** (procedural Standard furniture/walls via `BufferGeometryUtils.mergeGeometries` **per material**) rendered as **few InstancedMeshes** (one draw per material for all live rooms) + **shared curtain InstancedMesh**. **No per-room `PointLight`** — lighting is baked into stronger emissive on shared materials so instancing stays cheap. No per-box meshes and no kit `Brick_InteriorWall` glTF (lean plaster back wall). Later phases may add kit props / unique layouts. Same exterior MegaKit bar, built pouco a pouco.
- **One asset, N instances:** `ensureApartmentRoomBaked()` runs once → shared geos/mats. `ApartmentDirector` stamps instance matrices (slot world × room local TRS). Draw-call impact: **before** N room meshes (× material groups) + N lights + N curtain meshes; **after** ≈#materials room InstancedMeshes + 1 curtain InstancedMesh for the whole live set (typically ~10 + 1 draws). Answer to “identical interiors load once, render many?”: **YES** via InstancedMesh. Not a substitute for fixing `draw frame+shadows` / Large glTF / terrain hitches (those dominate Travamentos).
- **Phase-1 visibility bar:** from the street you must instantly see “tem quarto” — bright/emissive walls strong enough under ACES outdoor exposure (no fill lights), and a **large near-glass silhouette** (sofa / plant) pushed toward the −Z opening. Furniture buried deep in the room is not enough. Product: menos é mais; rooms still readable through glass.

## Command API (`ApartmentDirector`)

Exposed as `window.__cityApartments` (`liveTarget` default `'all'`).

| Call | Effect |
|------|--------|
| `registerFacade(id, { slots, pose, parent })` | Remember a revealed building placement |
| `setLiveCount(facadeId, count)` | Set **intent** (`number` \| `'all'`); stream pump ranks mid-height street-facing slots, loads **full open interiors** for `'all'` = all slots (`want = ranked.length`) with hard ms/frame budget + yields; heap demotion unloads farthest if needed |
| `getLiveTarget()` | Current budget (`number` \| `'all'`) |
| `loadedCount()` | Full interiors only (room present) |
| `curtainOnlyCount()` | Units that kept a closed curtain after a budget cut |
| `load(facadeId, slotIds)` | Load one or more apartments on that facade |
| `loadCount(facadeId, n)` | Load `n` best idle slots (mid-height street-facing, largest first) |
| `unload(facadeId?, slotIds?)` | Remove interiors + curtains |
| `update(dt)` | Animate curtain open (instance scale only; shared mat) |
| `pickFacadeNear(x, z)` | Nearest registered facade to planar point |

## HUD (`#apts-budget`)

- Compact panel: label **Interiores**, `−` / number input / `+`, button **Todos** (aria-pressed when `liveTarget === 'all'`; pressed on boot).
- Applies to nearest facade (free-fly camera if active, else car) → `markFacadeHouse({ autoLoad: false })` → `setLiveCount` (HUD owns the budget; mark must not race an auto apply after Todos).
- Immediate apply on `+/−/Todos` and on Enter / change in the input. Busy class while applying.
- While applying, the number input and banner track **live/total** (for `'all'`, input rises with loaded count — must not stay stuck at the previous budget).
- Hidden in `boot-idle` like other floats.

## Curtain states (per apartment)

`idle` → `loading` (curtain instance **closed**) → `ready` (room instance stamped, optional `compileAsync` on instancer root, **curtain snap-hidden**) → `open`.

Budget cut / heap demotion: prefer **full unload** of farthest slots (release instance id). Legacy `curtain-only` state can still be reloaded to a full room if encountered. Raising the budget again loads missing rooms and opens curtains.

Curtain hides **as soon as** the interior instance is stamped (snap hide — no closed plane left over the glass). No FPS adapt.

**Shared curtain InstancedMesh:** one `MeshStandardMaterial` + one unit `PlaneGeometry`, instance matrix scaled per slot. Lean choice vs thin per-slot planes: **instanced** (same shared program, 1 draw). Compile warms **once** on the instancer root; do not create per-unit curtain materials (that caused ~11s `apartment-curtain` hitch spam × N). Never mutate shared `material.opacity` — open/close via instance `scale` (hidden = scale 0). Do not dispose shared curtain geo/mat on unit teardown.

**Draw during budget apply:** apartment `compileSubtree` uses `pause: false` so a long Todos batch does **not** hold `pauseDraw` / freeze the canvas. The game loop keeps presenting; curtains hide and room instances show through glass as each unit becomes `ready`. Shared room **and curtain** InstancedMesh programs skip re-compile after the first warm. Nature/carpet (prio ≥4) while interactive also compile with `pause: false`. No FPS HOLD / adaptive pauseDraw for world streaming or apartments.

**Stream pacing (Todos / setLiveCount):** each full-room unit runs inside `throughValve` (LoadGovernor `budgetMs`) and is followed by `yieldToMain` (double-rAF, resets stream frame budget). No Phase-B curtain-only flood for `'all'`. Per-room cost stays lean: **instance matrix stamp only** + shared emissive materials (**no** per-room lights). Hitch law: apartment-driven Travamentos frames >1000ms are bugs — the pump must keep presenting under load (including coincident nature stream).

**Stream ownership while intent pumps:** `_pumpLiveIntent` sets `streamIntent` (`isApartmentLiveIntentActive`). While active, WorldStream **defers** nature / water / carpet work at **prio ≥4** (ring `pumpTo` skip + `pumpNatureSlice` / `pumpCarpetSlice` early return) so their `pauseDraw` + multi-second `compileSubtree(parent)` cannot freeze the canvas mid-Todos. Resume when the intent finally-block releases. Shared curtain + room GPU programs are **warmed once** (`pause:false`) on the InstancedMesh root before the full-room pump. Not an FPS HOLD / adaptive valve. Separately: when **interactive**, nature/carpet reveals compile with `pause: false` (no multi-second `pauseDraw` freeze on `stream ring` / `nature bg`).

## Orientation

- Room opening faces local **−Z**; `slotLocalMatrix` builds +Z = inward (−outward normal). Curtain at local −Z (outside glass). If a facade’s slots face the wrong way, rooms sit inside the mass — fix normals once at slot extract / matrix, don’t special-case per building.

## Out of scope

- Per-frame quality adapt / HOLD / FPS-driven pauseDraw for apartments.
- Unique furniture per unit (one shared template is enough).
- Sync-slamming every window on the click frame (stream pump + yields own pacing; product still wants all slots live under Todos).

## Marker

- First **Large** facade auto-gets a giant house billboard (~80 m) + yellow beacon at **Y=160** + cyan pole, plus a yellow HTML banner `CASA APTS · N/total vivos`, and **auto-applies `liveTarget`** on mark (`autoLoad` default true). The Interiores HUD moves the marker with `autoLoad: false` then applies the requested budget itself.
